import { basename, join } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import axios from 'axios'
import { createLogger } from 'el-bot'
import fs from 'fs-extra'
import ProgressBar from 'progress'

const logger = createLogger().child({ label: '📦' })

/**
 * Repo 类
 */
export default class Repo {
  /**
   * Latest Release 信息链接
   * https://developer.github.com/v3/repos/releases/#get-the-latest-release
   */
  url: string
  /**
   * 版本
   */
  version: string
  /**
   * release 下载链接
   */
  browser_download_url: string
  constructor(public owner: string, public repo: string) {
    this.url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`
    this.version = ''
    this.browser_download_url = ''
  }

  async getLatestVersion() {
    const browser_download_url = await axios
      .get(this.url)
      .then((res) => {
        this.version = res.data.tag_name
        this.browser_download_url = res.data.assets[0].browser_download_url
        logger.info(`Latest Version: ${this.version}`)
        return this.browser_download_url
      })
      .catch((err) => {
        logger.error(err.message)
        logger.error('获取最新版本失败')
      })
    return browser_download_url
  }

  async downloadLatestRelease(dest = '.') {
    if (!this.browser_download_url) {
      const lastestVersion = await this.getLatestVersion()
      if (!lastestVersion)
        return
    }

    const filename = basename(new URL(this.browser_download_url).pathname)
    if (!filename)
      throw new Error('Release URL has no filename')
    const path = join(dest, filename)
    await fs.ensureDir(dest)
    const response = await fetch(this.browser_download_url, { signal: AbortSignal.timeout(120000) })
    if (!response.ok || !response.body)
      throw new Error(`Release download failed: HTTP ${response.status}`)
    const file = await fs.open(path, 'wx')
    try {
      const total = Number(response.headers.get('content-length'))
      const bar = total > 0 ? new ProgressBar('Downloading [:bar] :percent :etas', { total, width: 20 }) : undefined
      const progress = new Transform({
        transform(chunk, _encoding, callback) {
          bar?.tick(chunk.length)
          callback(null, chunk)
        },
      })
      await pipeline(Readable.fromWeb(response.body), progress, fs.createWriteStream(path, { fd: file }))
      logger.success('下载完成')
    }
    catch (error) {
      await fs.remove(path)
      throw error
    }
  }
}

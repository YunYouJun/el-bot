import axios from "axios";
import fs from "fs";
import { log } from "mirai-ts";
import download from "download";

/**
 * Repo 类
 */
export class Repo {
  /**
   * Latest Release 信息链接
   * https://developer.github.com/v3/repos/releases/#get-the-latest-release
   */
  url: string;
  /**
   * 版本
   */
  version: string;
  /**
   * release 下载链接
   */
  browser_download_url: string;
  constructor(public owner: string, public repo: string) {
    this.url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
    this.version = '未知';
    this.browser_download_url = '未知';
  }

  async getLatestVersion() {
    await axios
      .get(this.url)
      .then((res) => {
        this.version = res.data.tag_name;
        this.browser_download_url = res.data.assets[0].browser_download_url;
        log.info("Latest Version: " + this.version);
      })
      .catch((err) => {
        log.error(err.toString());
      });
  }

  downloadLatestRelease(dest = ".") {
    const filename = this.browser_download_url.split("/").pop();
    const path = dest + "/" + filename;

    if (fs.existsSync(path)) {
      log.error(`${path} 已存在！`);
      return;
    }

    try {
      download(this.browser_download_url);
    } catch (err) {
      console.log(err);
    }
  }
};

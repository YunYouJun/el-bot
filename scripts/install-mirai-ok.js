const inquirer = require("inquirer")
const fs = require("fs")
const { http } = require("follow-redirects")
const { log } = require("mirai-ts")

function downloadFile(url, dest = ".") {
  const filename = url.split("/").pop()
  const path = dest + "/" + filename

  if (fs.existsSync(path)) {
    log.error(`${path} 已存在！`)
    return
  }

  const file = fs.createWriteStream(path)
  http
    .get(url, (res) => {
      const len = parseInt(res.headers["content-length"], 10)
      let downloaded = 0
      let percent = 0
      log.info(`开始下载 ${filename} ...`)
      res
        .on("data", (chunk) => {
          file.write(chunk)
          downloaded += chunk.length
          percent = ((100.0 * downloaded) / len).toFixed(2)
          process.stdout.write(
            `Downloading ${filename}: ${percent}% ${downloaded} bytes\r`
          )
        })
        .on("end", () => {
          log.success(`下载 ${filename} 完成!`)
        })

      // close file
      file.on("finish", () => {
        file.close()
      })
    })
    .on("error", (err) => {
      fs.unlink(path)
      console.log(err)
      log.error(
        "下载失败（应该是国内行情导致的网络问题），可以到 707408530 群文件下载 mirai-api-http-*.jar，手动放置到 /plugins 目录下。"
      )
    })
}

inquirer
  .prompt([
    {
      type: "rawlist",
      name: "mirai",
      message:
        "您想要安装什么版本的 MiraiOK（https://github.com/LXY1226/miraiOK）？",
      choices: [
        {
          name: "Linux-amd64: 服务器（大多数是这个）",
          value: "http://t.imlxy.net:64724/mirai/MiraiOK/miraiOK_linux_amd64",
        },
        {
          name: "Linux-arm64: 64位 arm 系",
          value: "http://t.imlxy.net:64724/mirai/MiraiOK/miraiOK_linux_arm64",
        },
        {
          name: "Linux-arm: arm 系",
          value: "http://t.imlxy.net:64724/mirai/MiraiOK/miraiOK_linux_arm",
        },
        {
          name: "Windows-386: mirai-native 用（el-bot 没用 mirai-native）",
          value:
            "http://t.imlxy.net:64724/mirai/MiraiOK/miraiOK_windows_386.exe",
        },
        {
          name: "Windows-amd64: 不用 native （Windows 用户大部分是这个）",
          value:
            "http://t.imlxy.net:64724/mirai/MiraiOK/miraiOK_windows_amd64.exe",
        },
        {
          name: "Darwin-amd64: macOS （你还有的选吗？）",
          value: "http://t.imlxy.net:64724/mirai/MiraiOK/miraiOK_darwin_amd64",
        },
      ],
    },
    {
      type: "confirm",
      name: "mirai-api-http",
      message: "是否下载最新版本 mirai-api-http？（使用 el-bot 务必安装！）",
    },
  ])
  .then((answers) => {
    downloadFile(answers.mirai)

    if (answers["mirai-api-http"]) {
      const Repo = require("./repo")
      const miraiApiHttp = new Repo("project-mirai", "mirai-api-http")
      miraiApiHttp.getLatestVersion().then(() => {
        miraiApiHttp.downloadLatestRelease("./plugins")
      })
    }
  })

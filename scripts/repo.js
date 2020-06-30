const axios = require("axios").default;
const fs = require("fs");
const { https } = require("follow-redirects");
const log = require("mirai-ts/dist/utils/log").default;

module.exports = class Repo {
  /**
   * https://developer.github.com/v3/repos/releases/#get-the-latest-release
   * @param {string} owner
   * @param {string} repo
   */
  constructor(owner, repo) {
    this.owner = owner;
    this.repo = repo;
    this.url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
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

    const file = fs.createWriteStream(path);
    https
      .get(this.browser_download_url, (res) => {
        const len = parseInt(res.headers["content-length"], 10);
        let downloaded = 0;
        let percent = 0;
        res
          .on("data", (chunk) => {
            file.write(chunk);
            downloaded += chunk.length;
            percent = ((100.0 * downloaded) / len).toFixed(2);
            process.stdout.write(
              `Downloading ${this.repo}: ${percent}% ${downloaded} bytes\r`
            );
          })
          .on("end", () => {
            log.success(`下载 ${this.repo} 完成!`);
          });

        // close file
        file.on("finish", () => {
          file.close();
        });
      })
      .on("error", (err) => {
        fs.unlink(path);
        console.log(err);
      });
  }
};

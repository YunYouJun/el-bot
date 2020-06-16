const dayjs = require("dayjs");
const htmlToText = require("html-to-text");
const fs = require("fs");
const schedule = require("node-schedule");

const Parser = require("rss-parser");

const log = require("../../lib/chalk");
const { sendMessageByConfig } = require("../../lib/message");

class Rss {
  constructor(rssConfig) {
    this.config = rssConfig;
    const options = {};
    options.customFields = rssConfig.customFields;
    this.parser = new Parser(options);
  }

  async parse() {
    let feed = await this.parser.parseURL(this.config.url);

    if (this.save(feed)) {
      // only semd first
      let content = feed.title + format(feed.items[0], this.config.content);
      sendMessageByConfig(content, this.config.target);
    }
  }

  save(feed) {
    const tmpDir = "tmp/rss/";
    const path = tmpDir + this.config.name + ".json";

    let cache = "";
    if (fs.existsSync(path)) {
      const data = fs.readFileSync(path);
      cache = data.toString();
    } else {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    const feedString = JSON.stringify(feed);
    if (feedString === cache) {
      log.info("RSS 未更新");
      return false;
    } else {
      log.info("RSS 已更新");
      fs.writeFile(path, JSON.stringify(feed), (err) => {
        if (err) log.error(err);
        log.success(`已在本地记录 ${feed.title} 新的 RSS 信息`);
      });
      return true;
    }
  }
}

function format(item, content) {
  item.updated = dayjs(item.updated).format("YYYY-MM-DD HH:mm:ss");
  if (item.summary) {
    item.summary = htmlToText.fromString(item.summary);
  }

  let template = "";
  content.forEach((line) => {
    template += "\n" + line;
  });

  // not use eval
  return Function("item", "return `" + template + "`")(item);
}

function rss() {
  const config = global.el.config;

  config.rss.forEach((rssConfig) => {
    const rss = new Rss(rssConfig);

    if (!rssConfig.cron) {
      rssConfig.cron = "*/15 * * * *";
    }

    schedule.scheduleJob(rssConfig.cron, () => {
      rss.parse();
    });
  });
}

module.exports = rss;

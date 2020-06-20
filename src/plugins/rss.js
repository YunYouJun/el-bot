const dayjs = require("dayjs");
const htmlToText = require("html-to-text");
const fs = require("fs");
const schedule = require("node-schedule");

const Parser = require("rss-parser");

const log = require("../utils/chalk");
const { sendMessageByConfig } = require("../../lib/message");

class Rss {
  constructor(rssConfig) {
    this.config = rssConfig;
    this.parser = new Parser({
      customFields: rssConfig.customFields,
    });
  }

  init() {
    schedule.scheduleJob(this.config.cron, () => {
      this.parse();
    });
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
      log.info(`RSS: ${feed.title} 未更新`);
      return false;
    } else {
      log.info(`RSS: ${feed.title} 已更新`);
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

  // default template
  if (!content) {
    content = [
      "标题：${item.title}",
      "链接：${item.link}",
      "时间：${item.updated}",
    ];
  }
  content.forEach((line) => {
    template += "\n" + line;
  });

  // not use eval
  return Function("item", "return `" + template + "`")(item);
}

function on() {
  const config = global.el.config;

  if (config.rss) {
    config.rss.forEach((rssConfig) => {
      const defaultConfig = {
        cron: "*/15 * * * *",
        customFields: {
          item: ["updated"],
        },
        content: [
          "标题：${item.title}",
          "链接：${item.link}",
          "时间：${item.updated}",
        ],
      };
      rssConfig = Object.assign(defaultConfig, rssConfig);

      const rss = new Rss(rssConfig);
      rss.init();
    });
  }
}

function onMessage(msg) {
  const config = global.el.config;

  if (msg.plain === "rss" && config.rss) {
    let content = "您当前订阅的 RSS 源：";
    config.rss.forEach((item) => {
      content += `\n${item.name}: ${item.url}`;
    });
    msg.reply(content);
  }
}

module.exports = {
  onMessage,
  on,
};

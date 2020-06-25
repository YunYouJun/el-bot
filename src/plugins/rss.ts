import dayjs from "dayjs";
import fs from "fs";
import htmlToText from "html-to-text";
import schedule from "node-schedule";
import Parser from "rss-parser";

import log from "../utils/chalk";
import { sendMessageByConfig } from "../../lib/message";
import el from "../el";
import { MessageType } from "mirai-ts";

interface RssConfig {
  name: string;
  url: string;
  cron: string;
  customFields: object;
  content: string[];
  target: object;
}

class Rss {
  config: RssConfig;
  parser: Parser;
  constructor(rssConfig: RssConfig) {
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
    let feed: Parser.Output = await this.parser.parseURL(this.config.url);

    if (feed.items && this.save(feed)) {
      // only semd first
      let content = feed.title + format(feed.items[0], this.config.content);
      sendMessageByConfig(content, this.config.target);
    }
  }

  save(feed: Parser.Output) {
    const tmpDir = "tmp/";
    const path = tmpDir + "rss.json";
    let rssJson: any = {};

    if (fs.existsSync(path)) {
      const data = fs.readFileSync(path);
      rssJson = JSON.parse(data.toString());
    } else {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    if (rssJson[this.config.name] && rssJson[this.config.name].lastBuildDate === feed.lastBuildDate) {
      log.info(`RSS: ${feed.title} 未更新`);
      return false;
    } else {
      log.info(`RSS: ${feed.title} 已更新`);
      rssJson[this.config.name] = {
        title: feed.title,
        lastBuildDate: feed.lastBuildDate
      };
      fs.writeFile(path, JSON.stringify(rssJson), (err) => {
        if (err) log.error(err);
        log.success(`已在本地记录 ${feed.title} 新的 RSS 信息`);
      });
      return true;
    }
  }
}

function format(item: Parser.Item, content: string[]) {
  item.updated = dayjs(item.updated).format("YYYY-MM-DD HH:mm:ss");

  if (item.summary) {
    item.summary = htmlToText.fromString(item.summary);
  }
  if (item.content) {
    item.content = htmlToText.fromString(item.content);
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
  const config = el.config;

  if (config.rss) {
    config.rss.forEach((rssConfig: RssConfig) => {
      const rss = new Rss(rssConfig);
      rss.init();
    });
  }
}

function onMessage(msg: MessageType.Message) {
  const config = el.config;

  if (msg.plain === "rss" && config.rss) {
    log.success("立即触发 RSS 抓取");
    let content = "您当前订阅的 RSS 源：";
    config.rss.forEach((rssConfig: RssConfig) => {
      content += `\n${rssConfig.name}: ${rssConfig.url}`;
      const rss = new Rss(rssConfig);
      rss.parse();
    });
    msg.reply(content);
  }
}

export {
  onMessage,
  on,
};

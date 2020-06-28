import dayjs from "dayjs";
import fs from "fs";
import htmlToText from "html-to-text";
import schedule from "node-schedule";
import Parser from "rss-parser";

import log from "mirai-ts/dist/utils/log";
import { sendMessageByConfig } from "../utils/message";
import { MessageType } from "mirai-ts";
import ElBot from "../bot";

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
    let feed: Parser.Output;
    try {
      feed = await this.parser.parseURL(this.config.url);
    } catch {
      log.error("超时，解析失败");
      return;
    }

    if (feed.items && this.save(feed)) {
      // only semd first
      const content = feed.title + format(feed.items[0], this.config.content);
      sendMessageByConfig(content, this.config.target);
    }
  }

  save(feed: Parser.Output) {
    if (feed.items && feed.items.length <= 0) return false;

    const tmpDir = "tmp/";
    const path = tmpDir + "rss.json";
    let rssJson: any = {};

    if (fs.existsSync(path)) {
      const data = fs.readFileSync(path);
      rssJson = JSON.parse(data.toString());
    } else {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    // 缓存文件不存在 或 对应对象不存在则更新
    if (
      Object.keys(rssJson).length === 0 || !rssJson[this.config.name] ||
      (feed.items && rssJson[this.config.name].items[0].pubDate !== feed.items[0].pubDate)
    ) {
      log.info(`RSS: ${feed.title} 已更新`);
      rssJson[this.config.name] = {
        title: feed.title,
        lastBuildDate: feed.lastBuildDate,
        items: [
          {
            title: (feed.items as any)[0].title,
            pubDate: (feed.items as any)[0].pubDate
          }
        ]
      };
      fs.writeFile(path, JSON.stringify(rssJson), (err) => {
        if (err) log.error(err);
        log.success(`已在本地记录 ${feed.title} 新的 RSS 信息`);
      });
      return true;
    } else {
      log.info(`RSS: ${feed.title} 未更新`);
      return false;
    }
  }
}

function format(item: Parser.Item, content: string[]) {
  item.updated = dayjs(item.updated).format("YYYY-MM-DD HH:mm:ss");
  item.pubDate = dayjs(item.pubDate).format("YYYY-MM-DD HH:mm:ss");

  if (item.summary) {
    item.summary = htmlToText.fromString(item.summary);
  }
  if (item.content) {
    item.content = htmlToText.fromString(item.content);
  }
  if (item.description) {
    item.description = htmlToText.fromString(item.description);
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

export default function (ctx: ElBot) {
  const config = ctx.el.config;
  const mirai = ctx.mirai;

  // 初始化定时
  if (config.rss) {
    config.rss.forEach((rssConfig: RssConfig) => {
      const rss = new Rss(rssConfig);
      rss.init();
    });
  }

  // 监听消息命令
  mirai.on('message', (msg: MessageType.SingleMessage) => {
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
  });
}

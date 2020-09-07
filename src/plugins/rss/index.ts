import dayjs from "dayjs";
import fs from "fs";
import htmlToText from "html-to-text";
import schedule from "node-schedule";
import Parser, { CustomFields } from "rss-parser";

import { MessageType } from "mirai-ts";
import ElBot from "../../bot";
import Bot from "../../bot";

interface RssConfig {
  name: string;
  url: string;
  cron: string;
  customFields: CustomFields;
  content: string[];
  target: object;
}

class Rss {
  config: RssConfig;
  parser: Parser;
  constructor(public bot: Bot, rssConfig: RssConfig) {
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
      this.bot.logger.error(
        `[rss] ${this.config.name} 超时，${this.config.url} 解析失败`
      );
      return;
    }

    if (feed.items && this.save(feed)) {
      // only semd first
      const content = feed.title + format(feed.items[0], this.config.content);
      this.bot.sender.sendMessageByConfig(content, this.config.target);
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
      Object.keys(rssJson).length === 0 ||
      !rssJson[this.config.name] ||
      (feed.items &&
        rssJson[this.config.name].items[0].pubDate !== feed.items[0].pubDate)
    ) {
      this.bot.logger.info(`[rss] ${feed.title} 已更新`);
      rssJson[this.config.name] = {
        title: feed.title,
        lastBuildDate: feed.lastBuildDate,
        items: [
          {
            title: (feed.items as any)[0].title,
            pubDate: (feed.items as any)[0].pubDate,
          },
        ],
      };
      fs.writeFileSync(path, JSON.stringify(rssJson));
      this.bot.logger.success(`[rss] 已在本地记录 ${feed.title} 新的 RSS 信息`);
      return true;
    } else {
      this.bot.logger.info(`[rss] ${feed.title} 未更新`);
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

/**
 * 立即触发 RSS 抓取
 * @param ctx
 * @param options
 */
function triggerRss(ctx: ElBot, options: RssConfig[]) {
  ctx.logger.success("[rss] 立即触发 RSS 抓取");
  let content = "您当前订阅的所有 RSS 源：";

  options.forEach((rssConfig: RssConfig) => {
    content += `\n${rssConfig.name}: ${rssConfig.url}`;
    const rss = new Rss(ctx, rssConfig);
    rss.parse();
  });

  return content;
}

export default function rss(ctx: ElBot, options: RssConfig[]) {
  const config = ctx.el.config;
  const mirai = ctx.mirai;

  // 初始化定时
  if (config.rss) {
    config.rss.forEach((rssConfig: RssConfig) => {
      const rss = new Rss(ctx, rssConfig);
      rss.init();
    });
  }

  // 监听消息命令
  mirai.on("message", (msg: MessageType.ChatMessage) => {
    if (
      msg.plain === "rss" &&
      config.rss &&
      ctx.user.isAllowed(msg.sender.id)
    ) {
      const content = triggerRss(ctx, options);
      if ((msg as MessageType.GroupMessage).sender.group) {
        let rssList = "";
        let count = 0;
        config.rss.forEach((rssConfig: RssConfig) => {
          if (ctx.status.isListening(msg.sender, rssConfig.target)) {
            count += 1;
            rssList += `\n${rssConfig.name}: ${rssConfig.url}`;
          }
        });
        if (count !== 0) {
          msg.reply(`本群共订阅了 ${count} 个 RSS 源：` + rssList);
        } else {
          msg.reply("本群尚未订阅 RSS");
        }
      } else {
        msg.reply(content);
      }
    }
  });
}

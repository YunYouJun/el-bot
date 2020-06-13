const dayjs = require("dayjs");
const htmlToText = require("html-to-text");

const log = require("../../lib/chalk");
const Parser = require("rss-parser");

const { sendMessageByConfig } = require("../../lib/message");
const { parse } = require("commander");

class Rss {
  constructor(rssConfig) {
    this.config = rssConfig;
    const options = {};
    options.customFields = rssConfig.customFields;
    this.parser = new Parser(options);
  }

  async parse() {
    let feed = await this.parser.parseURL(this.config.url);
    console.log(feed.title);
    // feed.items.forEach((item) => {
    //   format(item, rss.content);
    // });
    let content = feed.title + format(feed.items[0], this.config.content);
    sendMessageByConfig(content, this.config.target);
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

function rss(msg) {
  if (msg.plain !== "rss") return;
  const mirai = global.bot.mirai;
  const config = global.el.config;

  config.rss.forEach((rssConfig) => {
    const rss = new Rss(rssConfig);
    rss.parse();
  });
}

module.exports = rss;

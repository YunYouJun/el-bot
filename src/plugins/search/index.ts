import Bot from "src/bot";

interface Engine {
  keywords: string[];
  url: string;
}

interface EngineList {
  [propName: string]: Engine;
}

const engineList: EngineList = {
  baidu: {
    keywords: ["百度", "度娘", "baidu"],
    url: "https://www.baidu.com/s?wd=",
  },
  google: {
    keywords: ["谷歌", "google"],
    url: "https://www.google.com/search?q=",
  },
  bing: {
    keywords: ["bing", "必应"],
    url: "https://cn.bing.com/search?q=",
  },
  buhuibaidu: {
    keywords: ["不会百度"],
    url: "https://buhuibaidu.me/?s=",
  },
};

/**
 * 根据搜索引擎返回对应链接
 * @param name engine name
 * @param keyword
 */
function getLinkByEngine(name: string, keyword: string) {
  keyword = encodeURI(keyword);
  if (engineList[name]) {
    return engineList[name].url + keyword;
  } else {
    for (const engine in engineList) {
      if (engineList[engine].keywords.includes(name)) {
        return engineList[engine].url + keyword;
      }
    }
    return "";
  }
}

export default function (ctx: Bot) {
  const mirai = ctx.mirai;
  mirai.on("message", (msg) => {
    const engineString = msg.plain.split(" ")[0];
    let keyword = msg.plain.slice(engineString.length).trim();
    const buhuibaidu = msg.plain.match(/不会百度(.*)吗/);
    if (buhuibaidu) {
      keyword = buhuibaidu[1].trim();
      msg.reply(getLinkByEngine("buhuibaidu", keyword));
    } else {
      const content = getLinkByEngine(engineString, keyword);
      if (content) {
        msg.reply(content);
      }
    }
  });
}

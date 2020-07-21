import log from "mirai-ts/dist/utils/log";
import Bot from "src";

interface Plugin {
  name: string,
  version: string;
  description: string;
}

type PluginType = "default" | "community" | "custom";

export default class Plugins {
  default: Plugin[];
  community: Plugin[];
  custom: Plugin[];
  constructor(public bot: Bot) {
    const plugins = bot.el.config.plugins;
    this.default = plugins.default || [];
    this.community = plugins.community || [];
    this.custom = plugins.custom || [];
  }
  /**
 * 加载对应类型插件
 * @param type 插件类型 default | custom
 * @param path 所在路径
 */
  load(type: PluginType, path: string) {
    const config = this.bot.el.config;
    if (config.plugins[type]) {
      config.plugins[type].forEach((name: string) => {
        try {
          const plugin = require(`${path}/${name}`).default;

          let pkg = {
            version: "未知",
            description: "未知",
          };
          try {
            pkg = require(`${path}/${name}/package.json`);
          } catch {
            if (type !== "default") {
              log.warning(`${name} 插件没有相关描述信息`);
            }
          }

          if (plugin) {
            this[type].push({
              name,
              version: plugin.version || pkg.version,
              description: plugin.description || pkg.description,
            });
            this.use(name, plugin);
          }
        } catch (error) {
          console.log(error);
          log.error(`插件 ${name} 加载失败`);
        }
      });
    }
  }

  /**
 * 使用插件
 * @param name 插件名
 * @param plugin
 */
  use(name: string, plugin: Function) {
    if (this.bot.el.config[name]) {
      plugin(this.bot, this.bot.el.config[name]);
    } else {
      plugin(this.bot);
    }
  }
}

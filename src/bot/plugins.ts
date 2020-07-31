import { log } from "mirai-ts";
import Bot from ".";

export interface Plugin {
  name: string;
  version: string;
  description: string;
}

export type PluginType = "default" | "official" | "community" | "custom";

const PluginTypeMap = {
  default: "默认插件",
  official: "官方插件",
  community: "社区插件",
  custom: "自定义插件",
};

export default class Plugins {
  default: Plugin[];
  official: Plugin[];
  community: Plugin[];
  custom: Plugin[];
  constructor(public bot: Bot) {
    const plugins = bot.el.config.plugins;
    this.default = plugins.default || [];
    this.official = plugins.official || [];
    this.community = plugins.community || [];
    this.custom = plugins.custom || [];
  }

  /**
   * 加载对应类型插件
   * @param type 插件类型 default | custom
   * @param path 所在路径
   */
  load(type: PluginType) {
    const config = this.bot.el.config;
    if (config.plugins[type]) {
      config.plugins[type].forEach((name: string) => {
        let pkgName = name;

        switch (type) {
          case "default":
            pkgName = `../plugins/${name}`;
            break;
          case "official":
            pkgName = `@el-bot/plugin-${name}`;
            break;
          case "community":
            pkgName = `el-bot-plugin-${name}`;
            break;
          case "custom":
            pkgName = name;
            break;
          default:
            break;
        }

        try {
          // 适配 module.exports
          const plugin = require(pkgName).default || require(pkgName);

          let pkg = {
            version: "未知",
            description: "未知",
          };
          try {
            pkg = require(`${pkgName}/package.json`);
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

  /**
   * 插件列表
   * @param type 插件类型
   */
  list(type: PluginType) {
    let content = PluginTypeMap[type] + ":\n";
    this[type].forEach((plugin: Plugin) => {
      content += `- ${plugin.name}@${plugin.version}: ${plugin.description}\n`;
    });
    return content;
  }
}

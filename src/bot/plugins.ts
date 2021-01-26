import Bot from ".";
import { merge } from "../utils/config";
import { resolve } from "path";

export interface Plugin {
  name: string;
  version: string;
  description: string;
}

export type PluginType = "default" | "official" | "community" | "custom";

export const PluginTypeMap: Record<PluginType, string> = {
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
    this.default = [];
    this.official = [];
    this.community = [];
    this.custom = [];
  }

  /**
   * 根据插件类型，获得插件标准全名或路径
   * @param name
   */
  getPluginFullName(name: string, type: PluginType) {
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
        pkgName = resolve(process.cwd(), name);
        break;
      default:
        break;
    }
    return pkgName;
  }

  /**
   * 加载对应类型插件
   * @param type 插件类型 default | custom
   * @param path 所在路径
   */
  load(type: PluginType) {
    const config = this.bot.el.config;
    if (config.plugins[type]) {
      config.plugins[type].forEach(async (name: string) => {
        const pkgName = this.getPluginFullName(name, type);

        try {
          const pluginPath = pkgName;
          const { default: plugin } = await import(pluginPath);

          let pkg = {
            name: pkgName,
            version: "未知",
            description: "未知",
          };
          try {
            pkg = await import(`${pluginPath}/package.json`);
          } catch {
            this.bot.logger.warning(`${name} 插件没有相关描述信息`);
          }

          if (plugin) {
            this[type].push({
              name: name || pkgName,
              version: plugin.version || pkg.version,
              description: plugin.description || pkg.description,
            });

            let options = null;
            try {
              options = await import(`${pluginPath}/options`);
            } catch {
              // this.bot.logger.error(`${pkgName}不存在默认配置`)
            }

            this.use(name, plugin, options, pkg);

            this.bot.logger.success(`[${type}] (${name}) 加载成功`);
          }
        } catch (err) {
          this.bot.logger.error(err.message);
          this.bot.logger.error(`[${type}] (${name}) 加载失败`);
        }
      });
    }
  }

  /**
   * 是否依赖于数据库
   * @param pkg
   */
  isBasedOnDb(pkg: any): boolean {
    if (pkg["el-bot"] && pkg["el-bot"].db && !this.bot.db) {
      this.bot.logger.warning(
        `[${pkg.name}] 如想要使用该插件，您须先启用数据库。`
      );
      return true;
    }
    return false;
  }

  /**
   * 使用插件
   * @param name 插件名
   * @param plugin 插件函数
   * @param options 默认配置
   * @param pkg 插件 package.json
   */
  use(name: string, plugin: Function, options?: any, pkg?: any) {
    // split / for custom path
    if (name.includes("/")) {
      const len = name.split("/").length;
      name = name.split("/")[len - 1];
    }

    // 插件基于数据库，但是未启用数据库时
    if (pkg && this.isBasedOnDb(pkg)) {
      return;
    }

    if (options) {
      if (this.bot.el.config[name]) {
        plugin(this.bot, merge(options, this.bot.el.config[name]));
      } else {
        plugin(this.bot, options);
      }
    } else {
      plugin(this.bot, this.bot.el.config[name]);
    }
  }

  /**
   * 插件列表
   * @param type 插件类型
   */
  list(type: PluginType) {
    const pluginTypeName = PluginTypeMap[type];
    let content = `无${pluginTypeName}\n`;
    if (this[type].length > 0) {
      content = pluginTypeName + ":\n";
      this[type].forEach((plugin: Plugin) => {
        content += `- ${plugin.name}@${plugin.version}: ${plugin.description}\n`;
      });
    }
    return content;
  }
}

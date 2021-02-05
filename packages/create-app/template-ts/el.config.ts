import { defineConfig, utils } from "el-bot";
import { resolve } from "path";
import { MiraiApiHttpConfig } from "mirai-ts";

export default defineConfig({
  qq: 712727946,
  // 你可以直接解析你的 mirai/mcl 中 mirai-api-http 的配置
  setting: utils.config.parse(
    resolve(
      process.cwd(),
      "../../../mcl/config/net.mamoe.mirai-api-http/setting.yml"
    )
  ) as MiraiApiHttpConfig,
  bot: {
    master: [910426929],
    plugins: {
      default: ["answer"],
      custom: ["./src/plugins/test"],
    },
  },
});

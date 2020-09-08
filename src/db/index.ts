import Bot from "../bot";
import { MongoClient } from "mongodb";
import { dbConfig } from "../el";
import ora from "ora";
import { analytics } from "./analytics";
import users from "./users";

export async function connectDb(bot: Bot, dbConfig: dbConfig): Promise<void> {
  if (!dbConfig.enable) return;

  const uri = dbConfig.uri || "mongodb://localhost:27017";
  const name = dbConfig.name || "el-bot";

  const linkDb = ora(`连接 MongoDB 数据库「${name}」`).start();
  const client = await MongoClient.connect(uri, {
    useUnifiedTopology: true,
  }).catch((err) => {
    bot.logger.error(err.message);
  });

  if (!client) return;

  try {
    linkDb.succeed();

    bot.client = client;
    bot.db = client.db(name);
  } catch (err) {
    bot.logger.error(err.message);
  }

  // 初始化用户信息表
  await users(bot);

  // 分析统计
  if (dbConfig.analytics) {
    analytics(bot);
  }
}

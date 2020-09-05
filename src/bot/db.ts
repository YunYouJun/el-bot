import Bot from ".";
import { MongoClient } from "mongodb";
import { dbConfig } from "../el";
import ora from "ora";

/**
 * db 配置项
 */

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
}

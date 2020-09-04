import Bot from ".";
import { MongoClient } from "mongodb";
import { dbConfig } from "../el";

/**
 * db 配置项
 */

export async function connectDb(bot: Bot, dbConfig: dbConfig): Promise<void> {
  if (!dbConfig.enable) return;

  const uri = dbConfig.uri || "mongodb://localhost:27017";
  const name = dbConfig.name || "el-bot";

  bot.logger.info(`连接 MongoDB 数据库「${name}」...`);
  const client = await MongoClient.connect(uri, {
    useUnifiedTopology: true,
  }).catch((err) => {
    bot.logger.error(err.message);
  });

  if (!client) return;

  try {
    bot.logger.success(`成功连接 MongoDB 数据库「${name}」`);
    bot.client = client;
    bot.db = client.db(name);
  } catch (err) {
    bot.logger.error(err.message);
  }
}

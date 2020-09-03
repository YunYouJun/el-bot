import Bot from ".";
import { MongoClient } from "mongodb";

/**
 * db 配置项
 */
export interface dbConfig {
  enable: boolean;
  url: string;
  name: string;
}

export function connectDb(bot: Bot, dbConfig: dbConfig) {
  if (!dbConfig.enable) return;

  const url = dbConfig.url || "mongodb://localhost:27017";
  const name = dbConfig.name || "el-bot";

  MongoClient.connect(url, (err, client) => {
    bot.logger.success("与 MongoDB 数据库成功建立连接");

    bot.db = client.db(name);
    client.close();
  });
}

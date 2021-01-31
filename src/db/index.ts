import Bot from "../bot";
import mongoose from "mongoose";
import { dbConfig } from "../el";
import { analytics } from "./analytics";

export async function connectDb(bot: Bot, dbConfig: dbConfig): Promise<void> {
  if (!dbConfig.enable) return;

  const uri = dbConfig.uri || "mongodb://localhost:27017/el-bot";

  const dbName = "MongoDB 数据库";
  bot.logger.info(`开始连接 ${dbName}`);

  mongoose.connect(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useFindAndModify: false,
    useCreateIndex: true,
  });

  const db = mongoose.connection;
  bot.db = db;

  db.on("error", () => {
    bot.logger.error(`${dbName}连接失败`);
  });
  db.once("open", () => {
    bot.logger.success(`${dbName}连接成功`);
  });

  if (!db) return;

  // 分析统计
  if (dbConfig.analytics) {
    analytics(bot);
  }
}

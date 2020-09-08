import Bot from "src/";

export default async function (bot: Bot) {
  if (!bot.db) return;
  const { db } = bot;

  const users = db.collection("users");

  // 初始化用户表
  if ((await users.find().count()) === 0) {
    users.createIndex(
      {
        qq: 1,
      },
      {
        unique: true,
      }
    );
    bot.logger.success("[db] 新建 Collection: users");
  }
}

import ElBot from "src/bot";
import { MessageAndEvent } from "mirai-ts/dist/mirai";
import { check } from "mirai-ts";
import { displayList } from "./utils";

export default async function (ctx: ElBot) {
  if (!ctx.db) return;
  const { db, mirai } = ctx;
  const users = db.collection("users");

  const blockedUsers = users.find({
    block: true,
  });

  const blacklist: number[] = [];
  await blockedUsers.forEach((user) => {
    blacklist.push(user.qq);
  });

  mirai.beforeListener.push((msg: MessageAndEvent) => {
    if (check.isChatMessage(msg) && blacklist.includes(msg.sender.id)) {
      mirai.active = false;
    } else {
      mirai.active = true;
    }
  });

  // register command
  // 显示当前已有的黑名单
  ctx.cli
    .command("blacklist")
    .description("黑名单")
    .option("-l, --list", "当前列表")
    .action(async (options) => {
      if (options.list) {
        ctx.reply(displayList(blacklist));
      }
    });

  mirai.on("message", (msg) => {
    if (!ctx.user.isAllowed(msg.sender.id)) return;

    let qq = 0;
    let info = "";

    const res1 = msg.plain.match(/黑名单 (.*)/);
    if (res1 && res1[1]) {
      qq = parseInt(res1[1].trim());
      info = `[blacklist] 将 ${qq} 加入黑名单`;
      blockUser(qq);
    }

    const res2 = msg.plain.match(/解除黑名单 (.*)/);
    if (res2 && res2[1]) {
      qq = parseInt(res2[1].trim());
      info = `[blacklist] 将 ${qq} 移出黑名单`;
      unBlockUser(qq);
    }

    if (info) {
      ctx.logger.success(info);
      msg.reply(info);
    }
  });

  function blockUser(qq: number) {
    users.updateOne(
      {
        qq,
      },
      {
        $set: {
          block: true,
        },
      },
      {
        upsert: true,
      }
    );
    if (!blacklist.includes(qq)) {
      blacklist.push(qq);
    }
  }

  function unBlockUser(qq: number) {
    users.updateOne(
      {
        qq,
      },
      {
        $set: {
          block: false,
        },
      },
      {
        upsert: true,
      }
    );
    const i = blacklist.indexOf(qq);
    if (i !== -1) {
      blacklist.splice(i, 1);
    }
  }
}

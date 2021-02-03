import Bot from "el-bot";
import { check, MessageType, EventType } from "mirai-ts";
import { initBlacklist, block, unBlock, displayList } from "./utils";

export default async function (ctx: Bot) {
  if (!ctx.db) return;
  const { mirai, cli } = ctx;

  const blacklist = await initBlacklist();

  mirai.beforeListener.push(
    (msg: MessageType.ChatMessage | EventType.Event) => {
      const isUserBlocked =
        check.isChatMessage(msg) && blacklist.users.has(msg.sender.id);
      const isGroupBlocked =
        msg.type === "GroupMessage" &&
        blacklist.groups.has(msg.sender.group.id);

      if (isUserBlocked || isGroupBlocked) {
        mirai.active = false;
      } else {
        mirai.active = true;
      }
    }
  );

  // register command
  // 显示当前已有的黑名单
  cli
    .command("blacklist")
    .description("黑名单")
    .option("-l, --list <type>", "当前列表", "all")
    .action(async (options) => {
      if (!ctx.user.isAllowed(undefined, true)) return;
      const listType = options.list;
      if (listType) {
        if (["user", "all"].includes(listType)) {
          ctx.reply(`当前用户黑名单：` + displayList(blacklist.users));
        }
        if (["group", "all"].includes(listType)) {
          ctx.reply(`当前群聊黑名单：` + displayList(blacklist.groups));
        }
      }
    });

  cli
    .command("block <type> [id]")
    .description("封禁")
    .action(async (type, id) => {
      if (!ctx.user.isAllowed(undefined, true)) return;
      const msg = ctx.mirai.curMsg;
      if (await block(type, parseInt(id))) {
        const info = `[blacklist] 封禁 ${type} ${id}`;
        msg!.reply!(info);
      }
    });

  cli
    .command("unblock <type> [id]")
    .description("解封")
    .action(async (type, id) => {
      if (!ctx.user.isAllowed(undefined, true)) return;
      const msg = ctx.mirai.curMsg;
      if (await unBlock(type, parseInt(id))) {
        const info = `[blacklist] 解封 ${type} ${id}`;
        msg!.reply!(info);
      }
    });
}

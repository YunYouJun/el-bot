import dayjs from "dayjs";
import Bot from "../../bot";
import schedule from "node-schedule";
import { MessageType } from "mirai-ts";
import { parseTime, checkTime } from "./utils";

interface Memo {
  time: string | Date;
  /**
   * 内容
   */
  content: string;
  /**
   * 群
   */
  group?: number;
  /**
   * 好友
   */
  friend?: number;
}

/**
 * 初始化 collection
 * @param db
 */
function initCollection(ctx: Bot) {
  if (!ctx.db) return;
  const { db } = ctx;
  const memosCollection = db.collection("memos");

  const memos = memosCollection.find({
    $or: [
      {
        time: { $type: "string" },
      },
      {
        time: {
          $gt: new Date(),
        },
      },
    ],
  });

  memos.forEach((memo: Memo) => {
    addSchedule(ctx, memo);
  });

  return memos;
}

/**
 * cli
 * @param ctx
 */
function initCli(ctx: Bot) {
  const { cli } = ctx;
  cli
    .command("memo")
    .description("备忘录")
    .option("-f, --format", "格式提示")
    .option("-t, --time <time...>", "时间，cron 或 date 格式")
    .option("-c, --content <content...>", "提示内容")
    .action((options) => {
      if (options.format) {
        ctx.reply(`
*    *    *    *    *    *
┬    ┬    ┬    ┬    ┬    ┬
│    │    │    │    │    │
│    │    │    │    │    └ 一周的某一天 (0 - 7) (0 或 7 代表星期天)
│    │    │    │    └───── 月 (1 - 12)
│    │    │    └────────── 一月的某一天 (1 - 31)
│    │    └─────────────── 时 (0 - 23)
│    └──────────────────── 分 (0 - 59)
└───────────────────────── 秒 (0 - 59, 可选的)

'42 * * * *': 每小时的第 42 分钟执行一次；
'*/5 * * * *': 每 5 分钟执行一次；

'el memo -t 2020-09-23 17:48:00 -c hello': 2020-09-23 17:48:00 向我发送 hello 信息
'el memo -t 10m -c hello': 十分钟后向我发送 hello 信息
`);
      }

      if (options.time && options.content) {
        let time = dayjs();
        const content = options.content.join(" ");
        if (options.time.length === 1) {
          const delay = parseTime(options.time);
          if (delay) {
            time = dayjs()
              .add(delay.day, "day")
              .add(delay.hour, "hour")
              .add(delay.minute, "minute");
          } else {
            ctx.reply("无法解析正确的定时，示例：1d1h1m");
            return;
          }
        } else if (options.time.length === 2) {
          // 从格式解析时间
          time = dayjs(time, "YYYY-MM-DD HH:mm:ss");
        } else {
          ctx.reply("格式不正确");
          return;
        }

        if (!checkTime(time.toDate())) {
          ctx.reply("时间期限不得超过一年");
          return;
        }

        const memo: Memo = {
          time: time.toDate(),
          content,
        };
        const msg = ctx.mirai.curMsg as MessageType.ChatMessage;
        memo.friend = msg.sender.id;
        if ((msg as MessageType.GroupMessage).sender.group) {
          memo.group = (msg as MessageType.GroupMessage).sender.group.id;
        }

        addSchedule(ctx, memo);
        addMemoForDb(ctx, memo);
        ctx.reply(
          `好的，我将在 ${time.format(
            "YYYY-MM-DD ddd HH:mm:ss"
          )} 提醒你 ${content}。`
        );
      }
    });
}

/**
 * 初始化定时器
 * @param ctx
 * @param time
 * @param content
 */
function addSchedule(ctx: Bot, memo: Memo) {
  const { mirai } = ctx;
  const msg = mirai.curMsg;
  schedule.scheduleJob(memo.time, () => {
    if (memo.group) {
      mirai.api.sendGroupMessage(memo.content, memo.group);
    } else if (memo.friend) {
      mirai.api.sendFriendMessage(memo.content, memo.friend);
    } else if (msg) {
      (msg as MessageType.ChatMessage).reply(memo.content);
    }
  });
}

/**
 * 添加备忘
 * @param ctx
 * @param memo
 */
function addMemoForDb(ctx: Bot, memo: Memo) {
  if (!ctx.db) return;
  const memosCollection = ctx.db.collection("memos");
  memosCollection.insertOne(memo);
}

export default function (ctx: Bot) {
  if (!ctx.db) {
    ctx.logger.warning(
      "[memo] 因为你尚未开启数据库，备注信息将会在机器人重启后丢失。"
    );
  }
  // init collection
  initCollection(ctx);

  // init cli
  initCli(ctx);
}

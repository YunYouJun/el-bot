import dayjs from "dayjs";
import Bot from "../../bot";
import schedule from "node-schedule";
import { ChatMessage } from "mirai-ts/dist/types/message-type";

interface Memo {
  time: string | Date;
  /**
   * 内容
   */
  content: string;
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
    addSchedule(ctx, memo.time, memo.content);
  });

  return memos;
}

const timeRegExp = new RegExp("^([0-9]+d)?([0-9]+h)?([0-9]+m)?$", "i");

/**
 * 解析时间
 * @param time example: 1d23h50m
 */
function parseTime(time: string) {
  const matches = timeRegExp.exec(time);
  if (matches) {
    return {
      day: parseInt(matches[1]) || 0,
      hour: parseInt(matches[2]) || 0,
      minute: parseInt(matches[3]) || 0,
    };
  } else {
    return null;
  }
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
        let time;
        const content = options.content.join(" ");
        if (options.time.length === 1) {
          time = parseTime(options.time);
          if (time) {
            time = dayjs()
              .add(time.day, "day")
              .add(time.hour, "hour")
              .add(time.minute, "minute")
              .toDate();
          } else {
            ctx.reply("格式不正确");
            return;
          }
        } else if (options.time.length === 2) {
          time = dayjs(time, "YYYY-MM-DD HH:mm-ss").toDate();
        } else {
          time = options.time.join(" ");
        }
        addSchedule(ctx, time, content);
        addMemo(ctx, time, content);
        ctx.reply(`好的，我将在 ${time} 提醒你 ${content}。`);
      }
    });
}

/**
 * 初始化定时器
 * @param ctx
 * @param time
 * @param content
 */
function addSchedule(ctx: Bot, time: string | Date, content: string) {
  const msg = ctx.mirai.curMsg;
  schedule.scheduleJob(time, () => {
    if (msg) {
      (msg as ChatMessage).reply(content);
    }
  });
}

/**
 * 添加备忘
 * @param ctx
 * @param time
 * @param content
 */
function addMemo(ctx: Bot, time: string | Date, content: string) {
  if (!ctx.db) return;
  const memosCollection = ctx.db.collection("memos");
  memosCollection.insertOne({
    time,
    content,
  });
}

export default function (ctx: Bot) {
  if (!ctx.db) {
    ctx.logger.warning(
      "[memo] 因为你尚未开启数据库时，备注信息将会在机器人重启后丢失。"
    );
  }
  // init collection
  initCollection(ctx);

  // init cli
  initCli(ctx);
}

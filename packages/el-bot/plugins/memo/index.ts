import type { Bot } from '../../core'
import type { IMemo } from './memo.schema'
import consola from 'consola'
import { pluginLogger } from '../../core'

/**
 * 初始化 collection
 */
async function initCollection(ctx: Bot) {
  if (!ctx.db)
    return
  const { Memo } = await import('./memo.schema')
  const memos = await Memo.find({
    $or: [
      {
        time: { $type: 'string' },
      },
      {
        time: {
          $gt: new Date(),
        },
      },
    ],
  })

  memos.forEach((memo: IMemo) => {
    addSchedule(ctx, memo)
  })

  return memos
}

export const tooltip = `
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
`

/**
 * cli
 * @param ctx
 */
function initCli(ctx: Bot) {
  const { cli } = ctx
  cli
    .command('memo')
    .description('备忘录')
    .option('-f, --format', '格式提示')
    .option('-t, --time <time...>', '时间，cron 或 date 格式')
    .option('-c, --content <content>', '提示内容')
    .action(({ format, time, content }: { format?: boolean, time?: string[], content?: string }) => {
      consola.info('memo', format, time, content)
      if (format) {
        // ctx.reply()
      }

      //   if (time && content) {
      //     let now = dayjs()
      //     let isCron = false
      //     if (time.length === 1) {
      //       const delay = parseTime(time)
      //       if (delay) {
      //         now = dayjs()
      //           .add(delay.day, 'day')
      //           .add(delay.hour, 'hour')
      //           .add(delay.minute, 'minute')
      //       }
      //       else {
      //         ctx.reply('无法解析正确的定时，示例：1d1h1m')
      //         return
      //       }
      //     }
      //     else if (time.length === 2) {
      //       // 从格式解析时间
      //       now = dayjs(time.join(' '), 'YYYY-MM-DD HH:mm:ss')
      //     }
      //     else if (time.length === 5) {
      //       // cron
      //       isCron = true
      //     }
      //     else {
      //       ctx.reply('格式不正确')
      //       return
      //     }

      //     if (!checkTime(now.toDate())) {
      //       ctx.reply('时间期限不得超过一年')
      //       return
      //     }

      //     const memo: IMemo = new Memo({
      //       time: isCron ? options.time.join(' ') : now.toDate(),
      //       content,
      //     })
      //     const msg = ctx.mirai.curMsg as MessageType.ChatMessage
      //     memo.friend = msg.sender.id
      //     if ((msg as MessageType.GroupMessage).sender.group)
      //       memo.group = (msg as MessageType.GroupMessage).sender.group.id

    //     addSchedule(ctx, memo)
    //     memo.save()
    //     const future = time.format('YYYY-MM-DD ddd HH:mm:ss')
    //     ctx.reply(
    //       `好的，我将在 ${isCron ? memo.time : future} 提醒你 ${content}。`,
    //     )
    //   }
    // })
    })
}

/**
 * 初始化定时器
 */
function addSchedule(_ctx: Bot, _memo: IMemo) {
  // const { mirai } = ctx
  // const msg = mirai.curMsg
  // schedule.scheduleJob(memo.time, () => {
  //   if (memo.group)
  //     mirai.api.sendGroupMessage(memo.content, memo.group)
  //   else if (memo.friend)
  //     mirai.api.sendFriendMessage(memo.content, memo.friend)
  //   else if (msg)
  //     (msg as MessageType.ChatMessage).reply(memo.content)
  // })
}

export default function (ctx: Bot) {
  if (!ctx.db) {
    pluginLogger
      .child({ plugin: 'memo' })
      .warning(
        '因为你尚未开启数据库，备注信息将会在机器人重启后丢失。',
      )
  }
  // init collection
  initCollection(ctx)

  // init cli
  initCli(ctx)
}

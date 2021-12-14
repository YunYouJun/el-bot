import type Bot from 'el-bot'

export default async function(ctx: Bot) {
  const { mirai } = ctx
  // const config = ctx.el.config;
  // mirai.api.sendFriendMessage("咳咳……麦克风测试，麦克风测试……", config.master[0]);

  ctx.logger.info('on message')
  mirai.on('message', (msg) => {
    // msg.reply(msg.plain);
    ctx.logger.debug(msg)
  })
}

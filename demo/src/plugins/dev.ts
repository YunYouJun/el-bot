import type Bot from 'el-bot'

export default async function(ctx: Bot) {
  const mirai = ctx.mirai
  console.log(ctx.el.path)

  const friendList = await mirai.api.friendList()
  console.log(friendList)
}

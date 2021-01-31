import Bot, { utils } from "el-bot";
import sagiri, { SagiriResult, Options as SagiriOptions } from "sagiri";
import { Message, MessageType } from "mirai-ts";

/**
 * 搜图设置
 */
interface SearchImageOptions {
  token: string;
  options?: SagiriOptions;
}

/**
 *
 * @param result 格式化结果
 */
function formatResult(result: SagiriResult): MessageType.MessageChain {
  const msgChain = [
    Message.Plain(`\n------------------\n`),
    Message.Image(null, result.thumbnail),
    Message.Plain(`\n相似度：${result.similarity}`),
    Message.Plain(`\n站点：${result.site}`),
    Message.Plain(`\n链接：${result.url}`),
    Message.Plain(`\n作者：${result.authorName || "未知"}`),
  ];
  return msgChain;
}

/**
 * 搜图 [SauceNAO](https://saucenao.com/)
 * @param ctx
 * @param config
 */
export default async function searchImage(
  ctx: Bot,
  options: SearchImageOptions
) {
  console.log(options);
  const { mirai } = ctx;
  const client = sagiri(options.token, options.options);

  const innerMode = new utils.InnerMode();

  mirai.on("message", (msg) => {
    innerMode.setMsg(msg);

    if (msg.plain === "搜图") {
      innerMode.enter();
      msg.reply("我准备好了！");
    }

    if (innerMode.status) {
      msg.messageChain.forEach(async (singleMessage) => {
        if (singleMessage.type === "Image" && singleMessage.url) {
          let replyContent: MessageType.MessageChain = [];

          try {
            console.log(singleMessage.url);
            const results = await client(singleMessage.url);
            const length = options.options?.results || 3;
            replyContent.push(Message.Plain(`返回 ${length} 个结果`));
            for (let i = 0; i < length; i++) {
              const result = results[i];
              const formatContent = formatResult(result);
              replyContent = replyContent.concat(formatContent);
            }
            msg.reply(replyContent);

            // 退出搜图模式
            innerMode.exit();
          } catch (err) {
            ctx.logger.error("[search-image]", err.message);
            console.error(err);
          }
        }
      });
    }
  });
}

import axios from "axios";
import ElBot from "../bot";
import { match } from "mirai-ts/dist/utils/message";
import { MessageType } from "mirai-ts";
export default function (ctx: ElBot) {
  const config = ctx.el.config;
  const hitokoto = config.hitokoto;
  const mirai = ctx.mirai;
  mirai.on('message', (msg: MessageType.SingleMessage) => {
    if (match(msg.plain, hitokoto.match)) {
      axios.get('https://v1.hitokoto.cn', {
        params: hitokoto.params
      }).then((res) => {
        const data = res.data;
        let words = data.hitokoto + ' ——' + data.from;
        if (data.from_who) words += data.from_who;
        msg.reply(words);
      });
    }
  });
}

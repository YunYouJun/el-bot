import Bot from "src/bot";
import { renderString } from "../../utils";
import * as Config from "../../types/config";

interface ReportOptions {
  /**
   * 报告事件类型
   */
  type: string;
  /**
   * 报告对象
   */
  target: Config.Target;
  /**
   * 报告消息模版
   */
  content: string;
}

export default function (ctx: Bot, options: ReportOptions[]) {
  options.forEach((option) => {
    ctx.webhook.on(option.type, (data: any) => {
      console.log(data);
      const text = renderString(option.content, data, "data");
      if (option.target) {
        ctx.sender.sendMessageByConfig(text, option.target);
      }
    });
  });
}

import Bot from "..";
import { EventEmitter } from "events";
import shell from "shelljs";
import { IncomingMessage, ServerResponse } from "http";

import { Webhooks } from "@octokit/webhooks";

// github handler
export interface handler extends EventEmitter {
  (
    req: IncomingMessage,
    res: ServerResponse,
    callback: (err: Error) => void
  ): void;
}

export default function (ctx: Bot) {
  const config = {
    secret: ctx.el.bot.secret || "el-psy-congroo",
    path: ctx.el.bot.path || "/webhook",
  };

  const handler = new Webhooks(config);

  handler.onError((err) => {
    ctx.logger.error(`Error: ${err.message}`);
  });

  // 处理
  handler.on("push", (event) => {
    ctx.logger.info(
      `Received a push event for ${event.payload.repository.name} to ${event.payload.ref}`
    );

    // git pull repo
    if (shell.exec("git pull").code !== 0) {
      ctx.logger.error("Git 拉取失败，请检查默认分支。");
    } else {
      ctx.logger.info("安装依赖...");
      shell.exec("yarn");
    }
  });

  return handler;
}

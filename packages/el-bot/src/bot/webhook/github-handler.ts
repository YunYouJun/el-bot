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

export default function (bot: Bot) {
  const config = {
    secret: bot.el.config.secret || "el-psy-congroo",
    path: bot.el.config.path || "/webhook",
  };

  const handler = new Webhooks(config);

  handler.onError((err) => {
    bot.logger.error(`Error: ${err.message}`);
  });

  // 处理
  handler.on("push", (event) => {
    bot.logger.info(
      `Received a push event for ${event.payload.repository.name} to ${event.payload.ref}`
    );

    // git pull repo
    if (shell.exec("git pull").code !== 0) {
      bot.logger.error("Git 拉取失败，请检查默认分支。");
    } else {
      bot.logger.info("安装依赖...");
      shell.exec("yarn");
    }
  });

  return handler;
}

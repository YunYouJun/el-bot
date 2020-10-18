import Bot from "..";
import { EventEmitter } from "events";
import createHandler from "github-webhook-handler";
import shell from "shelljs";
import { IncomingMessage, ServerResponse } from "http";
// github handler
export interface handler extends EventEmitter {
  (
    req: IncomingMessage,
    res: ServerResponse,
    callback: (err: Error) => void
  ): void;
}

export default function (bot: Bot): handler {
  const handler = createHandler({
    path: bot.el.config.path || "/webhook",
    secret: bot.el.config.secret || "el-psy-congroo",
  });

  handler.on("error", (err) => {
    bot.logger.error(`Error: ${err.message}`);
  });

  // 处理
  handler.on("push", (event) => {
    bot.logger.info(
      `Received a push event for ${event.payload.repository.name} to ${event.payload.ref}`
    );

    // git pull repo
    if (shell.exec("git pull").code !== 0) {
      bot.logger.error("Git pull repo failed");
    } else {
      bot.logger.info("Install dependencies");
      shell.exec("yarn");
    }
  });

  return handler;
}

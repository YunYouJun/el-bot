import createHandler from "github-webhook-handler";
import shell from "shelljs";
import http from "http";
import { log } from "mirai-ts";

import { WebhookConfig } from "./index";

/**
 * 初始化 github webhook
 * @param options
 */
export function initGitHubHandler(
  options: WebhookConfig,
  req: http.IncomingMessage,
  res: http.ServerResponse
) {
  const githubHandler = createHandler({
    path: options.path || "/webhook",
    secret: options.secret || "el-psy-congroo",
  });

  githubHandler.on("error", (err) => {
    log.error(`Error: ${err.message}`);
  });

  // 处理
  githubHandler.on("push", function (event) {
    log.info(
      `Received a push event for ${event.payload.repository.name} to ${event.payload.ref}`
    );

    // git pull repo
    if (shell.exec("git pull").code !== 0) {
      shell.echo("Error: Git pull xiao-yun failed");
      shell.exit(1);
    } else {
      // install dependencies
      shell.exec("yarn");
    }
  });

  githubHandler(req, res, (err) => {
    if (err) {
      console.error(err);
      res.statusCode = 404;
      res.end("no such location");
    }
  });

  // no issues
  // githubHandler.on("issues", function (event) {
  //   console.log(
  //     "Received an issue event for %s action=%s: #%d %s",
  //     event.payload.repository.name,
  //     event.payload.action,
  //     event.payload.issue.number,
  //     event.payload.issue.title
  //   );
  // });
}

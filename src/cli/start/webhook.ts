import http from "http";
import createHandler from "github-webhook-handler";
import { log } from "mirai-ts";
import shell from "shelljs";

interface WebhookConfig {
  port?: number;
  path?: string;
  secret?: string;
  /**
   * 回调函数
   */
  callback?: (handler: any) => {};
}

/**
 * 启动 webhhook
 * @param cb
 */
export function startWebhook(webhook?: WebhookConfig) {
  // 默认配置
  const defaultConfig = {
    port: 7777,
    path: "/webhook",
    secret: "el-psy-congroo",
  };

  if (!webhook) {
    webhook = defaultConfig;
    log.info("当前使用默认配置");
  }

  const handler = createHandler({
    path: webhook.path || "/webhook",
    secret: webhook.secret || "el-psy-congroo",
  });

  // 启动监听
  http
    .createServer((req, res) => {
      handler(req, res, (err) => {
        console.log(err);
        res.statusCode = 404;
        res.end("no such location");
      });
    })
    .listen(webhook.port || 7777);

  log.success(`Listening ${webhook.path}:${webhook.port}`);

  handler.on("error", (err) => {
    log.error(`Error: ${err.message}`);
  });

  // 处理
  handler.on("push", function (event) {
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

  // 执行回调函数
  if (webhook.callback) {
    webhook.callback(handler);
  }

  // no issues
  // handler.on("issues", function (event) {
  //   console.log(
  //     "Received an issue event for %s action=%s: #%d %s",
  //     event.payload.repository.name,
  //     event.payload.action,
  //     event.payload.issue.number,
  //     event.payload.issue.title
  //   );
  // });
}

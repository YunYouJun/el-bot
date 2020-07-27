import http from "http";
import createHandler from "github-webhook-handler";
import { resolve } from "path";
import { log } from "mirai-ts";
import shell from "shelljs";

export function startWebhook() {
  // 默认配置
  let el = {
    webhook: {
      port: 7777,
      path: "/webhook",
      secret: "el-psy-congroo",
    }
  };

  // 获取配置
  try {
    el = require(resolve(process.cwd(), "../el"));
  } catch {
    log.info("当前使用默认配置");
  }

  const webhook = el.webhook;
  const handler = createHandler({
    path: webhook.path,
    secret: webhook.secret,
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
    }
  });

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

require("dotenv").config();
const http = require("http");
const createHandler = require("github-webhook-handler");
const handler = createHandler({
  path: "/webhook",
  secret: process.env.WEBHOOK_SECRET || "el-bot-js",
});

const { argv } = require("yargs");
const shell = require("shelljs");

// 监听端口
let port = 7777;
if (argv.port) {
  port = argv.port;
}

// 启动监听
http
  .createServer(function (req, res) {
    handler(req, res, function (err) {
      res.statusCode = 404;
      res.end("no such location");
    });
  })
  .listen(port);

handler.on("error", function (err) {
  console.error("Error:", err.message);
});

// 处理
handler.on("push", function (event) {
  console.log(
    "Received a push event for %s to %s",
    event.payload.repository.name,
    event.payload.ref
  );

  const repo = event.payload.repository.name;

  // 监听 commit
  if (argv.watch === "commit" && repo === "el-bot-js") {
    // git pull
    if (shell.exec("git pull").code !== 0) {
      shell.echo("Error: Git pull el-bot-js failed");
      shell.exit(1);
    }
  }

  // git pull custom config
  if (shell.exec("cd config/custom && git pull").code !== 0) {
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

const http = require("http");
const createHandler = require("github-webhook-handler");
const handler = createHandler({ path: "", secret: "" });

const shell = require("shelljs");

http
  .createServer(function (req, res) {
    handler(req, res, function (err) {
      res.statusCode = 404;
      res.end("no such location");
    });
  })
  .listen(7777);

handler.on("error", function (err) {
  console.error("Error:", err.message);
});

handler.on("push", function (event) {
  console.log(
    "Received a push event for %s to %s",
    event.payload.repository.name,
    event.payload.ref
  );

  const repo = event.payload.repository.name;
  if (repo === "el-bot-js") {
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

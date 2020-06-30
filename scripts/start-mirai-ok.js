const glob = require("glob");
const shell = require("shelljs");
const log = require("mirai-ts/dist/utils/log").default;

glob("./miraiOK_*", {}, (err, files) => {
  if (err) console.log(err);

  if (files[0]) {
    shell.chmod("+x", files[0]);
    shell.exec(files[0]);
  } else {
    log.error("请先通过 npm run install:mirai 下载对应的 MiraiOK 版本。");
  }
});

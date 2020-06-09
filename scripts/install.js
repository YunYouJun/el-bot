const Repo = require("../lib/Repo");

miraiConsoleWrapper = new Repo("mamoe", "mirai-console-wrapper");
miraiConsoleWrapper.getLatestVersion().then(() => {
  miraiConsoleWrapper.downloadLatestRelease();
});

miraiApiHttp = new Repo("mamoe", "mirai-api-http");
miraiApiHttp.getLatestVersion().then(() => {
  miraiApiHttp.downloadLatestRelease("./plugins");
});

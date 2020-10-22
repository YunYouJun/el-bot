import Bot from "src/bot";

// interface GitHubOptions {}

export default function (ctx: Bot) {
  const { cli } = ctx;
  cli.command("github").description("GitHub 小助手");
}

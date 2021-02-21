import { Command } from "./index";

export type CommandList = Map<string, Command>;

export function getHelpContent(list: CommandList) {
  let content = "帮助指令：";
  for (let [key, command] of list) {
    content += `\n ${key}: ${command.desc}`;
  }
  return content;
}

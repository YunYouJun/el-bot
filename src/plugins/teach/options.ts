import * as Config from "src/types/config";

export interface TeachOptions {
  listen: Config.Listen;
  /**
   * 回复
   */
  reply: string;
  /**
   * 没有权限时的回复
   */
  else: string;
}

export const teachOptions: TeachOptions = {
  listen: ["master", "admin"],
  reply: "我学会了！",
  else: "你在教我做事？",
};

import { Match } from "mirai-ts/dist/utils/check";

export interface NiubiOptions {
  /**
   * API URL
   */
  url: string;
  match: Match[];
}

const niubiOptions: NiubiOptions = {
  url: "https://el-bot-api.vercel.app/api/words/niubi",
  match: [
    {
      re: {
        pattern: "来点(\\S*)笑话",
        flags: "i",
      },
    },
    {
      is: "nb",
    },
  ],
};

export default niubiOptions;

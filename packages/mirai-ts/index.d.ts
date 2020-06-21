// / <reference path="./types / message - type.d.ts" />;

import * as MessageType from "./types/message-type";
import Mirai from "./src";
import log from "./utils/chalk";

export {
  MessageType,
  log
};
declare const Mirai: Mirai;
export default Mirai;

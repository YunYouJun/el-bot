import Bot from "./bot";
export default Bot;

export * as utils from "./utils";

if (typeof module !== "undefined") {
  module.exports = Bot;
  module.exports.default = Bot;
  module.exports.ElBot = Bot;
}

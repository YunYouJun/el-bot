import Bot from "./bot";
export default Bot;

// 必须放在最前面，适配 js require
if (typeof module !== 'undefined') {
  module.exports = Bot;
  module.exports.default = Bot;
  module.exports.Bot = Bot;
  exports = module.exports;
}

export * as utils from "./utils";

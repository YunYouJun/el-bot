import Bot from "./bot";
export default Bot;

// 必须放在最前面
if (typeof module !== 'undefined') {
  exports = module.exports = Bot;
}

export * as utils from "./utils";

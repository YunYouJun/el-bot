import Bot from "./bot";
export default Bot;

// 必须放在最前面，适配 js require
if (typeof module !== 'undefined') {
  exports = module.exports = Bot; // lgtm [js/useless-assignment-to-local]
}

export * as utils from "./utils";

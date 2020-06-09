function getPlain(messageChain) {
  let msg = "";
  messageChain.forEach((chain) => {
    if (chain.type === "Plain") msg += chain.text;
  });
  return msg;
}

module.exports = {
  getPlain,
};

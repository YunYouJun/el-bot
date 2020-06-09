const { echo } = require("./echo");
const { forward } = require("./forward");
const { getPlain } = require("../../utils/index");

function messageHandler(res) {
  const config = global.el.config;
  res.plain = getPlain(res.messageChain);

  // echo
  // if (config.echo.enable) {
  //   echo(res);
  // }
  // forward
  // config.forward.forEach((item) => {
  //   forward(res, item);
  // });
}

module.exports = messageHandler;

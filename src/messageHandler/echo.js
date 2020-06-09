function echo(res) {
  const msg = res.plain.trim();
  const re = /echo\\s(.+)/gi;
  res.reply(msg.match(re)[0]);
}

module.exports = { echo };

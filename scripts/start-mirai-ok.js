const glob = require("glob");
const shell = require("shelljs");

glob("./miraiOK_*", {}, (err, files) => {
  if (err) console.log(err);

  shell.chmod("+x", files[0]);
  shell.exec(files[0]);
});

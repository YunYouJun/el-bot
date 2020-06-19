const yaml = require("js-yaml");
const fs = require("fs");

/**
 * https://www.npmjs.com/package/js-yaml#safeload-string---options-
 * now we can use !!js/undefined !!js/function !!js/regexp
 * @param {String} file
 */
function parse(file) {
  // return yaml.safeLoad(fs.readFileSync(file));
  return yaml.load(fs.readFileSync(file));
}

function isObject(item) {
  return typeof item === "object";
}

function merge(target, source) {
  for (const key in source) {
    if (isObject(target[key]) && isObject(source[key])) {
      merge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

module.exports = {
  parse,
  merge,
};

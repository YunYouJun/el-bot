/**
 * 渲染 ES6 字符串
 * @param template 字符串模版
 * @param data 数据
 * @param name 参数名称
 */
function renderString(template: string, data: any, name: string) {
  return Function(name, "return `" + template + "`")(data);
}

export { renderString };

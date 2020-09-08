export function displayList(blacklist: number[]) {
  let content = "当前黑名单：";
  blacklist.forEach((qq) => {
    content += `\n- ${qq}`;
  });
  return content;
}

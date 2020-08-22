import { Collection } from "lokijs";
/**
 * 展示当前的问答列表
 */
export function displayList(teach: Collection) {
  const list = teach.data;
  let listContent = "问答列表：";
  list.forEach((qa) => {
    listContent += `\nQ: 「${qa.question}」 A: 「${qa.answer}」`;
  });
  return listContent;
}

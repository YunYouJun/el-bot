import { Collection } from "mongodb";

/**
 * 展示当前的问答列表
 */
export function displayList(teach: Collection) {
  // find {} to return all documents
  const list = teach.find({});
  let listContent = "问答列表：";
  list.forEach((qa) => {
    listContent += `\nQ: 「${qa.question}」 A: 「${qa.answer}」`;
  });
  return listContent;
}

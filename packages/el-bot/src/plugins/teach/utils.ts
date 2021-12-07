import { Teach } from './teach.schema'

/**
 * 展示当前的问答列表
 */
export async function displayList() {
  const list = await Teach.find()
  let listContent = '问答列表：'
  list.forEach((qa) => {
    listContent += '\n----------'
    listContent += `\nQ: 「${qa.question}\nA: 「${qa.answer}」`
  })
  return listContent
}

export * as respondent from './respondent'

export const commonPlugins = [
  'console',
  'dataview',
  'echo',
  'insight',
  // 'logger',
  'manager',
  'status',
  // https://koishi.js.org/plugins/teach/
  'teach',
]

export const selfId = process.env.BOT_QQ || ''

export const groups = {
  first: {
    name: '机器人测试群',
    id: 120117362,
  },
  second: {
    name: '测试群二号',
    id: 275834309,
  },
}

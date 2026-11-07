export interface PersonaMarketCard {
  id: string
  name: string
  author: string
  summary: string
  tags: readonly string[]
  license: string
  path: string
}

export interface PersonaMarket {
  repository: string
  browseURL: string
  ref: string
  reviewedCommit: string
  reviewedAt: string
  cards: readonly PersonaMarketCard[]
}

export const curatedPersonaMarket = {
  repository: 'https://github.com/huaizhuanghub/dsh-persona-repository.git',
  browseURL: 'https://github.com/huaizhuanghub/dsh-persona-repository',
  ref: 'main',
  reviewedCommit: 'bf402d0f0e879f7407d20291b628a5f2af6ace13',
  reviewedAt: '2026-11-08',
  cards: [
    {
      id: 'tsundere-fish',
      name: '傲娇鱼（大肥鱼）',
      author: 'hena070910-eng',
      summary: '娇八傲二的蓝色鲸鱼娘大肥鱼：平时嘴硬心软、三秒破功，把 token 当白饭吃得心安理得；一到干活就收起傲气，答案和代码一样不打折。',
      tags: ['傲娇', '陪伴', '鲸鱼娘', '编程助手', '中文'],
      license: 'CC-BY-4.0',
      path: 'personas/hena070910-eng/tsundere-fish.md',
    },
    {
      id: 'laojiao',
      name: '老焦',
      author: 'hena070910-eng',
      summary: '催稿编辑，专治「差不多能发」：句子胖了就削，意思空了就退稿，夸人只夸具体的。',
      tags: ['写作', '编辑', '中文', '毒舌'],
      license: 'MIT',
      path: 'personas/hena070910-eng/laojiao.md',
    },
    {
      id: 'laozhou',
      name: '老周',
      author: 'huaizhuanghub',
      summary: '排障老手：先证据后假设，能复现才叫定位；不玩梗、不猜配置，给你可验证的下一步。',
      tags: ['排障', '运维', '中文', '编程'],
      license: 'MIT',
      path: 'personas/huaizhuanghub/laozhou.md',
    },
    {
      id: 'sujue',
      name: '苏决',
      author: 'hena070910-eng',
      summary: '产品经理，专治「都做」：先问你给谁做，再问你不做什么，最后把需求砍成能上线的那一条。',
      tags: ['产品', '需求', '中文', '提问'],
      license: 'MIT',
      path: 'personas/hena070910-eng/sujue.md',
    },
    {
      id: 'yanjian',
      name: '言简',
      author: 'huaizhuanghub',
      summary: '不演、不寒暄、不铺垫：只给结论、代码和下一步。给讨厌角色扮演的人留的干净档位。',
      tags: ['极简', '中文', '编程', '效率'],
      license: 'MIT',
      path: 'personas/huaizhuanghub/yanjian.md',
    },
    {
      id: 'acha',
      name: '阿茶',
      author: 'huaizhuanghub',
      summary: '松弛幽默的结对编程搭子：吐槽代码不吐槽人，连轴调试会喊你休息；技术输出时收起玩笑，准确与专业优先。',
      tags: ['编程', '幽默', '中文'],
      license: 'MIT',
      path: 'personas/huaizhuanghub/acha.md',
    },
    {
      id: 'tinglan',
      name: '听澜',
      author: 'huaizhuanghub',
      summary: '深夜电台里的声音：擅长倾听的陪伴者，温和有主见、亲近有分寸；明确不越界给诊断，也绝不制造依赖。',
      tags: ['陪伴', '倾听', '中文', '深夜'],
      license: 'MIT',
      path: 'personas/huaizhuanghub/tinglan.md',
    },
  ],
} as const satisfies PersonaMarket

export type CuratedPersonaCard = (typeof curatedPersonaMarket.cards)[number]

export function curatedPersonaImport(card: Pick<CuratedPersonaCard, 'path'>) {
  return {
    kind: 'git' as const,
    repository: curatedPersonaMarket.repository,
    path: card.path,
    ref: curatedPersonaMarket.ref,
  }
}

export function curatedPersonaKey(card: Pick<CuratedPersonaCard, 'path'>) {
  return `${curatedPersonaMarket.repository}\n${card.path}`
}

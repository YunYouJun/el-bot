import type { Contact } from 'mirai-ts'
import type { Bot } from '.'
import type { BaseListenType, ListenTarget } from '../../types/config'

type Listen = BaseListenType | ListenTarget

export class Status {
  constructor(public ctx: Bot) {}

  isListening(sender: Contact.User, listen: Listen): boolean {
    const group = 'group' in sender ? (sender as Contact.Member).group : undefined
    if (typeof listen === 'string') {
      switch (listen) {
        case 'all': return true
        case 'master': return this.ctx.user.isMaster(sender.id)
        case 'admin': return Boolean(this.ctx.user.isAdmin(sender.id))
        case 'friend': return !group
        case 'group': return Boolean(group)
      }
    }
    if (Array.isArray(listen))
      return listen.some(item => typeof item === 'number' ? item === sender.id || item === group?.id : this.isListening(sender, item))
    return Boolean(listen.friend?.includes(sender.id) || (group && listen.group?.includes(group.id)))
  }

  getListenStatusByConfig(sender: Contact.User, config: { listen?: Listen, unlisten?: Listen }): boolean {
    return (!config.listen || this.isListening(sender, config.listen)) && (!config.unlisten || !this.isListening(sender, config.unlisten))
  }
}

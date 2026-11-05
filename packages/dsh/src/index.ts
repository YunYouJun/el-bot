import type { ManagedQQ, PersonaContext } from './contracts'
import type { Settings } from './service'
import { PersonaAdmission } from './admission'
import { personaRoutes } from './http'
import { PersonaService } from './service'

export const name = 'el-bot-dsh-personas'
export const inject = ['webServer', 'connection', 'systemPrompt']

export function apply(ctx: PersonaContext & { inject: (names: string[], callback: (scope: PersonaContext) => (() => void)) => unknown }, settings: Settings = {}) {
  if (typeof ctx.connection.requestRejection !== 'function')
    throw new Error('DSH does not expose authenticated HTTP route admission')
  const service = new PersonaService(settings)
  const admission = new PersonaAdmission(service)
  service.runtime = () => admission.counts()
  ctx.provide('elBotPersonas', service)
  ctx.effect(() => personaRoutes(ctx, service))
  ctx.on('system-prompt/assemble', async (_assembly, context, next) => {
    const assembly = await next()
    const text = admission.context(context.agent)
    return text ? { ...assembly, contexts: [...(assembly.contexts ?? []), { name: 'el-bot:persona', text, interpolate: false }] } : assembly
  })
  ctx.inject(['qqWorkspaceGrouping'], (scope) => {
    const grouping = scope.get('qqWorkspaceGrouping') as { watchManager: (listener: (manager: ManagedQQ) => void) => (() => void) }
    if (typeof grouping.watchManager !== 'function')
      throw new Error('Update the @el-bot/dsh QQ workspace adapter before enabling character cards')
    let detach: (() => void) | undefined
    const stop = grouping.watchManager((manager) => {
      detach?.()
      detach = admission.attach(manager)
    })
    return () => {
      stop()
      detach?.()
    }
  })
}

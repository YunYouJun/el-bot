import { host, locale, openUrl, platform, signal, Storage } from 'nsh'
import en from '../locales/en.json'
import zh from '../locales/zh-Hans.json'

export interface ClientEvent { action: string, value?: string, field?: string }
export interface ClientState {
  page: string
  locale: string
  localePreference: string
  strings: Record<string, string>
  languages: { tag: string, name: string }[]
  draft: Record<string, string>
  programs: { name: string, title: string, action: string }[]
  host: string
  pending: boolean
  localExpanded: boolean
  error: string
  note: string
  phase: string
  phaseKey: string
  qq: string
  agent: string
  agentConnection: string
  task: string
  busy: boolean
  confirmation: string
  preferences: { messageFormat: string, imageTheme: string }
  preferencesLoaded: boolean
  logs: string
  personaLoaded: boolean
  personaName: string
  personaDescription: string
  personaSelection: string
  personaChoices: { value: string, name: string }[]
}

export function initialState(language = 'en'): ClientState {
  const strings: Record<string, string> = language.startsWith('zh') ? zh : en
  return {
    page: 'quickActions',
    locale: language,
    localePreference: '',
    strings,
    languages: [{ tag: '', name: strings.followSystem }, { tag: 'zh-Hans', name: '简体中文' }, { tag: 'en', name: 'English' }],
    draft: { cloudUrl: '' },
    programs: [],
    host: '',
    pending: false,
    localExpanded: false,
    error: '',
    note: '',
    phase: strings.waiting,
    phaseKey: '',
    qq: strings.waiting,
    agent: 'Codex',
    agentConnection: strings.waiting,
    task: '',
    busy: false,
    confirmation: '',
    preferences: { messageFormat: 'markdown', imageTheme: 'light' },
    preferencesLoaded: false,
    logs: '',
    personaLoaded: false,
    personaName: strings.defaultPersona,
    personaDescription: strings.defaultDescription,
    personaSelection: 'default',
    personaChoices: [],
  }
}

export function cloudAddress(value: string): string {
  const address = new URL(value.trim())
  if (address.protocol !== 'https:' || address.username || address.password || address.search || address.hash)
    throw new Error('Use an HTTPS login address without credentials, query parameters or a fragment.')
  return address.toString()
}

// The UI only knows these events. Desktop execution remains in the bounded,
// independently tested Go controller, behind the native host's fixed channel.
export function createClient() {
  const desktop = ['macos', 'windows', 'linux'].includes(platform.os) && host.available()
  const state = signal(initialState(locale()))
  const connection = signal('')
  const chooserPending = signal(false)
  const update = (values: Partial<ClientState>) => state.set({ ...state(), ...values })
  const fail = (error: unknown) => update({ error: error instanceof Error ? error.message : String(error) })

  function receive(value: unknown) {
    if (isClientState(value))
      state.set(value)
    else fail(new Error('The client returned an invalid response.'))
  }

  if (desktop) {
    host.on('client.state', receive)
    host.on('client.failed', fail)
    host.call('client.snapshot').then(receive).catch(fail)
  }
  else {
    // Phone/Web settings contain only a server address and language preference.
    Storage.getItem('yun.connection').then((value) => {
      if (value) {
        connection.set(cloudAddress(value))
        update({ draft: { cloudUrl: value } })
      }
    }).catch(fail)
    Storage.getItem('yun.locale').then(value => applyMobileLocale(value ?? '')).catch(fail)
  }

  function applyMobileLocale(value: string) {
    const language = value || locale()
    const translated = initialState(language)
    update({ locale: language, localePreference: value, strings: translated.strings, languages: translated.languages })
  }

  async function send(event: ClientEvent) {
    if (desktop) {
      try {
        await host.call('client.event', event)
      }
      catch (error) { fail(error) }
      return
    }
    switch (event.action) {
      case 'navigate':
        update({ page: event.value ?? 'quickActions', error: '', note: '' })
        break
      case 'edit':
        update({ draft: { ...state().draft, [event.field!]: event.value ?? '' } })
        break
      case 'locale':
        applyMobileLocale(event.value ?? '')
        await Storage.setItem('yun.locale', event.value ?? '')
        break
      case 'saveCloud':
        try {
          const address = cloudAddress(state().draft.cloudUrl)
          await Storage.setItem('yun.connection', address)
          connection.set(address)
          update({ error: '', note: state().strings.settingsSaved })
        }
        catch (error) { fail(error) }
        break
      case 'openCloud': case 'managePersonas':
        if (!connection()) {
          update({ page: 'settings', error: state().strings.connectionRequired })
          break
        }
        try {
          const address = new URL(connection())
          if (event.action === 'managePersonas')
            address.hash = 'el-bot-personas'
          await openUrl(address.toString())
        }
        catch (error) { fail(error) }
        break
    }
  }

  async function choose(field: string) {
    if (chooserPending() || state().pending)
      return
    chooserPending.set(true)
    try {
      const path = await host.call('client.choosePath', field, { timeout: 300_000 })
      if (typeof path === 'string')
        await send({ action: 'edit', field, value: path })
    }
    catch (error) { fail(error) }
    finally { chooserPending.set(false) }
  }

  return { state, desktop, chooserPending, send, choose, fail }
}

export type Client = ReturnType<typeof createClient>

export function isClientState(value: unknown): value is ClientState {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return false
  const data = value as Record<string, unknown>
  const strings = ['page', 'locale', 'localePreference', 'host', 'error', 'note', 'phase', 'phaseKey', 'qq', 'agent', 'agentConnection', 'task', 'confirmation', 'logs', 'personaName', 'personaDescription', 'personaSelection']
  const flags = ['pending', 'localExpanded', 'busy', 'preferencesLoaded', 'personaLoaded']
  const record = (item: unknown): item is Record<string, string> => !!item && typeof item === 'object' && !Array.isArray(item) && Object.values(item).every(value => typeof value === 'string')
  const entries = (items: unknown, keys: string[]) => Array.isArray(items) && items.every(item => record(item) && keys.every(key => typeof item[key] === 'string'))
  return strings.every(key => typeof data[key] === 'string')
    && flags.every(key => typeof data[key] === 'boolean')
    && record(data.strings) && record(data.draft) && record(data.preferences)
    && typeof data.preferences.messageFormat === 'string' && typeof data.preferences.imageTheme === 'string'
    && entries(data.languages, ['tag', 'name']) && entries(data.programs, ['name', 'title', 'action'])
    && entries(data.personaChoices, ['value', 'name'])
    && ['quickActions', 'personas', 'settings'].includes(String(data.page))
}

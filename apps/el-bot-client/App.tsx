import type { Client } from './src/client'
import { effect, host, Image, mount, Scroll, Text, View, windowSize } from 'nsh'
import { isAvailable, Menu, titleBar, Window } from 'nsh/desktop'
import appIcon from './icons/icon.png'
import { createClient } from './src/client'
import { Button, Card, Choice, colors, Field, Label } from './src/components'

function QuickActions(props: { client: Client }) {
  const c = props.client
  const s = c.state
  const t = (key: string) => s().strings[key] ?? key
  return (
    <View style={{ gap: 18 }}>
      <Card title={t('cloud')} description={c.desktop ? t('cloudDescription') : t('homeDescription')}>
        <Button testID="open-cloud" label={t('openCloud')} primary disabled={s().pending} onPress={() => c.send({ action: 'openCloud' })} />
        <Button label={t('configureCloud')} onPress={() => c.send({ action: 'navigate', value: 'settings' })} />
      </Card>
      <If when={c.desktop}>
        <Card title={t('programs')}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <Each of={s().programs}>{program => <Button label={program().action} disabled={s().pending} onPress={() => c.send({ action: 'openProgram', value: program().name })} />}</Each>
          </View>
        </Card>
        <Button label={t(s().localExpanded ? 'collapseLocal' : 'expandLocal')} onPress={() => c.send({ action: 'toggleLocal', value: String(!s().localExpanded) })} disabled={s().pending} />
        <If when={s().localExpanded}>
          <Card title={t('localBot')}>
            <Label>{s().phase}</Label>
            <Label muted>{`QQ · ${s().qq}`}</Label>
            <Label muted>{`${s().agent} · ${s().agentConnection}`}</Label>
            <If when={s().task}><Label>{`${t('task')} · ${s().task}`}</Label></If>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Button label={t('refresh')} disabled={s().pending} onPress={() => c.send({ action: 'refreshStatus' })} />
              <Button label={t('start')} disabled={s().pending || s().phaseKey !== 'stopped'} onPress={() => c.send({ action: 'start' })} />
              <Button label={t('stop')} disabled={s().pending || !['running', 'starting'].includes(s().phaseKey)} onPress={() => c.send({ action: 'stop' })} />
              <Button label={t('restart')} disabled={s().pending || s().phaseKey !== 'running'} onPress={() => c.send({ action: 'restart' })} />
            </View>
          </Card>
        </If>
      </If>
    </View>
  )
}

function Personas(props: { client: Client }) {
  const c = props.client
  const s = c.state
  const t = (key: string) => s().strings[key] ?? key
  return (
    <Card title={t('currentPersona')} description={c.desktop ? t('personaHint') : t('cloudDescription')}>
      <If when={c.desktop}>
        <Text style={{ fontSize: 24, color: colors().text, fontWeight: '600' }}>{s().personaName}</Text>
        <Label muted>{s().personaDescription}</Label>
        <If when={s().personaLoaded}><Choice label={t('personas')} value={s().personaSelection} items={s().personaChoices.map(item => ({ value: item.value, label: item.name }))} disabled={s().pending} onChange={value => c.send({ action: 'persona', value })} /></If>
        <Button label={t('refreshPersona')} disabled={s().pending} onPress={() => c.send({ action: 'refreshPersonas' })} />
      </If>
      <Button label={t('managePersonas')} primary disabled={s().pending} onPress={() => c.send({ action: 'managePersonas' })} />
    </Card>
  )
}

function Settings(props: { client: Client }) {
  const c = props.client
  const s = c.state
  const t = (key: string) => s().strings[key] ?? key
  const fields = ['nodePath', 'cliPath', 'configPath', 'credentialsPath', 'statePath', 'codexAppPath', 'codebuddyAppPath', 'dshAppPath', 'qqAppPath']
  return (
    <View style={{ gap: 18 }}>
      <Card title={t('cloud')} description={c.desktop ? t('cloudHint') : t('cloudUrlHint')}>
        <Field label={t(c.desktop ? 'sshHost' : 'cloudUrl')} value={s().draft[c.desktop ? 'sshHost' : 'cloudUrl'] ?? ''} disabled={s().pending} onChange={value => c.send({ action: 'edit', field: c.desktop ? 'sshHost' : 'cloudUrl', value })} />
        <Button label={t(c.desktop ? 'saveCloud' : 'saveCloudUrl')} primary disabled={s().pending} onPress={() => c.send({ action: 'saveCloud' })} />
      </Card>
      <Card title={t('language')}>
        <Choice label={t('language')} value={s().localePreference} items={s().languages.map(item => ({ value: item.tag, label: item.name }))} onChange={value => c.send({ action: 'locale', value })} />
      </Card>
      <If when={c.desktop}>
        <Card title={t('environment')} description={t('savedPathsHint')}>
          <Each of={fields}>{field => <Field label={t(field())} value={s().draft[field()] ?? ''} disabled={s().pending || c.chooserPending()} onChange={value => c.send({ action: 'edit', field: field(), value })} onChoose={() => c.choose(field())} chooseLabel={t('choose')} />}</Each>
          <Button label={t('saveSettings')} primary disabled={s().pending} onPress={() => c.send({ action: 'saveLocal' })} />
        </Card>
        <Card title={t('preferences')}>
          <Button label={t('readPreferences')} disabled={s().pending} onPress={() => c.send({ action: 'readPreferences' })} />
          <Choice label={t('messageFormat')} value={s().preferences.messageFormat} items={['image', 'markdown', 'text'].map(value => ({ value, label: t(value) }))} disabled={s().pending || !s().preferencesLoaded} onChange={value => c.send({ action: 'editPreference', field: 'messageFormat', value })} />
          <Choice label={t('imageTheme')} value={s().preferences.imageTheme} items={['light', 'dark'].map(value => ({ value, label: t(value) }))} disabled={s().pending || !s().preferencesLoaded} onChange={value => c.send({ action: 'editPreference', field: 'imageTheme', value })} />
          <Button label={t('savePreferences')} disabled={s().pending || !s().preferencesLoaded} onPress={() => c.send({ action: 'savePreferences' })} />
        </Card>
        <Card title={t('logs')}>
          <Button label={t('refreshLogs')} disabled={s().pending} onPress={() => c.send({ action: 'logs' })} />
          <Text style={{ userSelect: 'text', fontSize: 12, color: colors().muted, lineHeight: 18 }}>{s().logs || t('noLogs')}</Text>
        </Card>
      </If>
    </View>
  )
}

function App() {
  const client = createClient()
  const s = client.state
  const t = (key: string) => s().strings[key] ?? key
  const wide = () => windowSize().width >= 760
  const nativeChrome = host.params.nativeChrome === true
  if (isAvailable && !nativeChrome)
    Window.setTitleBar({ style: 'hidden', height: 44 })
  host.on('desktop.show', () => {
    if (isAvailable)
      Window.orderFront()
  })
  effect(() => {
    if (!isAvailable)
      return
    Window.setTitle(t('appName'))
    const languages = s().languages.map(item => ({ label: item.name, checked: s().localePreference === item.tag, onSelect: () => void client.send({ action: 'locale', value: item.tag }) }))
    Menu.setApplicationMenu([
      { label: t('appName'), submenu: [{ label: t('settings'), shortcut: 'CmdOrCtrl+,', onSelect: () => void client.send({ action: 'navigate', value: 'settings' }) }, { type: 'separator' }, { label: t('quit'), shortcut: 'CmdOrCtrl+Q', onSelect: () => void host.call('client.quit').catch(client.fail) }] },
      { label: t('editMenu'), submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
      { label: t('viewMenu'), submenu: [{ label: t('showWindow'), shortcut: 'CmdOrCtrl+Shift+B', onSelect: () => Window.orderFront() }, { label: t('language'), submenu: languages }] },
      { label: t('windowMenu'), submenu: [{ role: 'minimize' }, { role: 'close' }] },
    ])
  })
  return (
    <View style={{ flex: 1, backgroundColor: colors().background, paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)', paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }}>
      <If when={!nativeChrome}>
        <View desktop={{ windowDrag: true }} style={{ height: isAvailable ? titleBar().height || 44 : 64, paddingLeft: isAvailable ? titleBar().left + 14 : 20, paddingRight: isAvailable ? titleBar().right + 14 : 20, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors().sidebar }}>
          <Image src={appIcon} style={{ width: 24, height: 24, borderRadius: 6 }} />
          <Text style={{ fontSize: 15, color: colors().text, fontWeight: '600' }}>{t('appName')}</Text>
          <View style={{ flex: 1 }} />
          <Label small muted>{s().pending ? t('pending') : ''}</Label>
        </View>
      </If>
      <View style={{ flex: 1, flexDirection: wide() ? 'row' : 'column' }}>
        <If when={!nativeChrome}>
          <View accessibilityLabel={t('sidebar')} style={{ width: wide() ? 210 : '100%', flexDirection: wide() ? 'column' : 'row', backgroundColor: colors().sidebar, padding: 14, gap: 8 }}>
            <Each of={['quickActions', 'personas', 'settings']}>{page => <Button testID={`nav-${page()}`} label={t(page())} selected={s().page === page()} onPress={() => client.send({ action: 'navigate', value: page() })} />}</Each>
            <If when={wide()}>
              <View style={{ flex: 1 }} />
              <Label small muted>{t('caption')}</Label>
              <If when={client.desktop}><Label small muted>{t('closeHint')}</Label></If>
            </If>
          </View>
        </If>
        <Scroll style={{ flex: 1, minWidth: 0 }} contentStyle={{ padding: wide() ? 32 : 18, gap: 22 }}>
          <Text style={{ fontSize: 30, fontWeight: '700', color: colors().text }}>{t(s().page)}</Text>
          <If when={s().error}><Text testID="error" style={{ color: colors().error, fontSize: 14 }}>{s().error}</Text></If>
          <If when={s().note}><Label muted>{s().note}</Label></If>
          <If when={s().confirmation}>
            <Card title={t('busyTitle')} description={t('busyDetail')}>
              <Button label={t('continue')} onPress={() => client.send({ action: 'cancelInterrupt' })} />
              <Button testID="confirm-interrupt" label={t('interrupt')} onPress={() => client.send({ action: 'confirmInterrupt', value: s().confirmation })} />
            </Card>
          </If>
          <If when={s().page === 'quickActions'}><QuickActions client={client} /></If>
          <If when={s().page === 'personas'}><Personas client={client} /></If>
          <If when={s().page === 'settings'}><Settings client={client} /></If>
        </Scroll>
      </View>
    </View>
  )
}

mount(App)

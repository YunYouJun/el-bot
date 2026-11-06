import type { JSX } from 'nsh'
import { colorScheme, Text, View } from 'nsh'
import { Input, Button as NativeButton, Select } from 'nsh/base'

export function colors() {
  return colorScheme() === 'dark'
    ? { background: '#121a25', sidebar: '#172230', surface: '#1e2d3e', text: '#edf4fc', muted: '#a5b8ce', line: '#34465c', accent: '#a7caff', onAccent: '#142b49', error: '#ffb4ab' }
    : { background: '#ffffff', sidebar: '#f2f6fc', surface: '#f5f8fc', text: '#21334c', muted: '#61758e', line: '#dbe4f0', accent: '#356eaf', onAccent: '#ffffff', error: '#b3261e' }
}

export function Label(props: { children: JSX.Element, muted?: boolean, small?: boolean }) {
  return <Text style={{ color: props.muted ? colors().muted : colors().text, fontSize: props.small ? 12 : 15, lineHeight: props.small ? 18 : 22 }}>{props.children}</Text>
}

export function Button(props: { label: string, onPress: () => void, disabled?: boolean, primary?: boolean, selected?: boolean, testID?: string }) {
  return (
    <NativeButton
      testID={props.testID}
      accessibilityLabel={props.label}
      disabled={props.disabled}
      onPress={props.onPress}
      style={{ minHeight: 40, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 9, justifyContent: 'center', backgroundColor: props.primary || props.selected ? colors().accent : colors().surface }}
      activeStyle={{ opacity: 0.65 }}
      hoverStyle={{ opacity: 0.8 }}
      focusStyle={{ borderWidth: 2, borderColor: colors().accent }}
      disabledStyle={{ opacity: 0.4 }}
    >
      <Text style={{ color: props.primary || props.selected ? colors().onAccent : colors().text, fontSize: 14, fontWeight: '600' }}>{props.label}</Text>
    </NativeButton>
  )
}

export function Card(props: { title: string, description?: string, children: JSX.Element }) {
  return (
    <View style={{ padding: 22, gap: 16, borderRadius: 16, backgroundColor: colors().surface, borderWidth: 1, borderColor: colors().line }}>
      <Text style={{ fontSize: 18, fontWeight: '600', color: colors().text }}>{props.title}</Text>
      <If when={props.description}><Label muted>{props.description}</Label></If>
      {props.children}
    </View>
  )
}

export function Field(props: { label: string, value: string, onChange: (value: string) => void, disabled?: boolean, onChoose?: () => void, chooseLabel?: string, testID?: string }) {
  return (
    <View style={{ gap: 7 }}>
      <Label small muted>{props.label}</Label>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Input
          testID={props.testID}
          accessibilityLabel={props.label}
          value={props.value}
          onChange={({ value }) => props.onChange(value)}
          readonly={props.disabled}
          autoCapitalize="none"
          autoCorrect={false}
          style={{ flex: 1, minWidth: 0, minHeight: 40, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: colors().text, backgroundColor: colors().background, borderRadius: 8, borderWidth: 1, borderColor: colors().line }}
        />
        <If when={props.onChoose}><Button label={props.chooseLabel ?? '…'} onPress={() => props.onChoose?.()} disabled={props.disabled} /></If>
      </View>
    </View>
  )
}

export function Choice(props: { label: string, value: string, items: { value: string, label: string }[], onChange: (value: string) => void, disabled?: boolean }) {
  return (
    <Select
      accessibilityLabel={props.label}
      value={props.value}
      items={props.items.map(item => ({ value: item.value, title: item.label }))}
      disabled={props.disabled}
      onChange={({ value }) => {
        if (value !== null)
          props.onChange(value)
      }}
      style={{ minHeight: 40, padding: 10, borderRadius: 8, backgroundColor: colors().background, borderWidth: 1, borderColor: colors().line }}
      popupStyle={{ backgroundColor: colors().background, borderRadius: 10, padding: 6, borderWidth: 1, borderColor: colors().line }}
      itemStyle={{ padding: 10, borderRadius: 6, color: colors().text, fontSize: 14 }}
      trigger={<Label>{props.items.find(item => item.value === props.value)?.label ?? props.label}</Label>}
    />
  )
}

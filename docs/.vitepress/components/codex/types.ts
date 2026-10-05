export interface ExampleMessage {
  role: 'user' | 'bot'
  text: string
  title?: string
  fields?: { label: string, value: string }[]
  section?: string
  footnote?: string
  actions?: ExampleAction[]
}

/** Static illustration of an official QQ keyboard action. */
export interface ExampleAction {
  label: string
  tone?: 'primary' | 'secondary' | 'danger'
}

export interface ExampleScenario {
  id: string
  title: string
  description: string
  messages: ExampleMessage[]
}

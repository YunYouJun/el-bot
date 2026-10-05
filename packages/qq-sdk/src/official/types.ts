export interface QQCredentials {
  appId: string
  secret: string
  sandbox?: boolean
  /** Override endpoints for private test servers only. */
  apiBase?: string
  tokenUrl?: string
}

export interface C2CMessage {
  id: string
  author: { user_openid: string }
  content: string
  timestamp: string
}

/** Official inline keyboard, using either a template or an explicit layout. */
export interface QQKeyboard {
  id?: string
  content?: { rows: { buttons: QQKeyboardButton[] }[] }
}

/** A QQ message button and its client-side action. */
export interface QQKeyboardButton {
  id: string
  render_data: {
    label: string
    visited_label?: string
    /** 0 gray outline; 1 blue outline; 3 red text on white; 4 white text on blue. */
    style?: 0 | 1 | 3 | 4
  }
  action: {
    type: 0 | 1 | 2
    data: string
    enter?: boolean
    permission: { type: 0 | 1 | 2, specify_user_ids?: string[] }
    unsupport_tips?: string
    modal?: { content: string, confirm_text?: string, cancel_text?: string }
  }
}

/** A custom Markdown reply; text content must be omitted in the REST request. */
export interface QQMarkdownReply {
  markdown: { content: string }
  keyboard?: QQKeyboard
}

export interface GatewayPayload {
  op: number
  s?: number
  t?: string
  d?: unknown
}

export interface GatewayOptions {
  onMessage: (message: C2CMessage) => Promise<void>
  onError: (error: Error) => void
  onReady?: () => void
  reconnectMs?: number
}

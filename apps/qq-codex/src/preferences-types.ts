export interface ReplyPreferences {
  messageFormat: 'image' | 'markdown' | 'text'
  imageTheme: 'light' | 'dark'
  restartRequired: boolean
}

export type ReplyPreferenceUpdate = Partial<Pick<ReplyPreferences, 'messageFormat' | 'imageTheme'>>

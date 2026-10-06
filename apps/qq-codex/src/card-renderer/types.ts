import type { Buffer } from 'node:buffer'

/** Local rendering settings, independent of message delivery. */
export interface CardRenderOptions {
  theme: 'light' | 'dark'
  fontFiles?: string[]
  fontFamily?: string
}

/** Display content only; no platform payloads, actions or task state. */
export interface ImageCard {
  title: string
  details: ImageCardDetails
  tone: 'primary' | 'success' | 'warning' | 'danger' | 'muted'
}

export interface ImageCardDetails {
  fields?: { label: string, value: string }[]
  body: string
  /** Omit to draw the body literally. Markdown never enables HTML or remote images. */
  bodyFormat?: 'markdown'
  section?: string
  footnote: string
  links?: { label: string, url: string }[]
  /** Command typography is reserved for structured, trusted documentation. */
  help?: { commands: ImageHelpCommand[], intro?: string, notes: string[], footer: string }
}

export interface ImageHelpCommand {
  command: string
  relatedCommands?: string[]
  parameters?: string
  description: string
}

export interface CardImage {
  png: Buffer
  width: number
  height: number
}

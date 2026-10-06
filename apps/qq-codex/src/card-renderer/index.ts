import type { CardImage, CardRenderOptions, ImageCard } from './types'
import { BrowserRenderer } from './browser'
import { renderCardHtml } from './html'

export { renderCardHtml } from './html'
export type { CardImage, CardRenderOptions, ImageCard, ImageCardDetails, ImageHelpCommand } from './types'

const renderer = new BrowserRenderer()

/** Render a bounded PNG with local fonts; failures leave fallback handling to the caller. */
export async function renderCardImage(card: ImageCard, options: CardRenderOptions): Promise<CardImage> {
  return renderer.render(renderCardHtml(card, options), options)
}

/** Drain queued screenshots and release Chromium during CLI or bot shutdown. */
export function closeCardRenderer(): Promise<void> {
  return renderer.close()
}

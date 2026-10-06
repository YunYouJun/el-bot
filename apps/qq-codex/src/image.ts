import type { ImageCard } from './card-renderer'
import type { ImageOptions, ReplyCard } from './types'
import { renderCardHtml, renderCardImage as renderImage } from './card-renderer'

export type { CardImage } from './card-renderer'
export { closeCardRenderer } from './card-renderer'

/** Validate the QQ reply before passing display content to the rendering module. */
function imageCard(card: ReplyCard): ImageCard {
  if (!card.visual || card.text.length > 12000)
    throw new Error('Card cannot be rendered as a bounded image')
  return card.visual
}

export function cardHtml(card: ReplyCard, options: Pick<ImageOptions, 'theme' | 'fontFamily'>) {
  return renderCardHtml(imageCard(card), options)
}

export async function renderCardImage(card: ReplyCard, options: Pick<ImageOptions, 'theme' | 'fontFamily' | 'fontFiles'>) {
  return renderImage(imageCard(card), options)
}

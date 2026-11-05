import MarkdownIt from 'markdown-it'

const markdown = new MarkdownIt({ html: false, linkify: false, breaks: true })
// Preview never executes HTML, fetches images, or navigates card links.
markdown.renderer.rules.image = (tokens, index) => markdown.utils.escapeHtml(tokens[index].content)
markdown.renderer.rules.link_open = () => '<span>'
markdown.renderer.rules.link_close = () => '</span>'

export function renderPersonaPreview(body: string) {
  return markdown.render(body)
}

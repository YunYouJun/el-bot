export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[character]!)
    .replace(/[\p{Cc}\uFFFE\uFFFF]/gu, character => ['\n', '\r', '\t'].includes(character) ? character : '�')
}

/** Quote family names as CSS strings so a configured name cannot inject a rule or tag. */
export function fontFamilies(value?: string): string {
  if (!value)
    return 'var(--ylf-font-body)'
  return `${value.split(',').map(name => JSON.stringify(name.trim()).replace(/</g, '\\3c ').replace(/>/g, '\\3e ')).join(',')},var(--ylf-font-body)`
}

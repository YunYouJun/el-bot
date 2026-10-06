import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

// Embed the published tokens once so PNGs and previews stay offline and share a theme.
const designCss = readFileSync(createRequire(import.meta.url).resolve('@yunlefun/ui/css'), 'utf8').trim()

/** Shared by PNG screenshots and generated documentation examples. */
export const CARD_CSS = `${designCss}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
.el-card-page {
  --background: var(--ylf-c-bg); --card: var(--ylf-c-surface); --body: var(--ylf-c-text);
  --muted: var(--ylf-c-text-3); --panel: var(--ylf-c-surface-inset); --line: var(--ylf-c-border);
  --code: var(--ylf-c-brand); --indicator: var(--ylf-c-brand); --card-type-scale: 1.5;
  --mono: var(--ylf-font-mono);
  width: var(--ylf-layout-reading); max-width: 100%; padding: var(--ylf-space-4); background: var(--background);
  color: var(--body); font-family: var(--card-font); -webkit-font-smoothing: antialiased;
}
.el-card-page[data-tone="success"] { --indicator: var(--ylf-status-success); }
.el-card-page[data-tone="warning"] { --indicator: var(--ylf-status-warning); }
.el-card-page[data-tone="danger"] { --indicator: var(--ylf-status-danger); }
.el-card-page[data-tone="muted"] { --indicator: var(--ylf-c-border-strong); }
/* YlfCard accent/blue surface with hoverable=false; padding is a supported override. */
.ylf-card {
  position: relative; background: var(--ylf-c-surface); color: var(--ylf-c-text);
  border: 1px solid var(--ylf-c-border); border-radius: var(--ylf-radius-lg); box-shadow: var(--ylf-shadow-control);
}
.ylf-card--accent { border-top: 3px solid var(--ylf-accent); }
.el-card { padding: var(--ylf-space-6); overflow-wrap: anywhere; }
.el-heading { display: flex; align-items: center; gap: var(--ylf-space-3); }
.el-state-mark { width: var(--ylf-space-2); height: var(--ylf-space-2); flex: 0 0 var(--ylf-space-2); border-radius: var(--ylf-radius-pill); background: var(--indicator); }
.el-title { margin: 0; font-family: var(--card-heading-font); font-size: calc(var(--ylf-text-xl) * var(--card-type-scale)); line-height: var(--ylf-leading-heading); font-weight: 700; }
.el-kicker { margin: 0 0 var(--ylf-space-3); color: var(--muted); font-size: calc(var(--ylf-text-sm) * var(--card-type-scale)); }
.el-fields { margin: var(--ylf-space-4) 0 0; display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: var(--ylf-space-1) var(--ylf-space-4); font-size: calc(var(--ylf-text-sm) * var(--card-type-scale)); line-height: var(--ylf-leading-body); }
.el-fields dt { color: var(--muted); }
.el-fields dd { margin: 0; min-width: 0; }
.el-identifier { font-family: var(--mono); color: var(--ylf-c-text-2); }
.el-divider { height: 1px; border: 0; background: var(--line); margin: var(--ylf-space-6) 0; }
.el-section { color: var(--ylf-c-brand); margin: 0 0 var(--ylf-space-4); font-family: var(--card-heading-font); font-size: calc(var(--ylf-text-sm) * var(--card-type-scale)); font-weight: 600; }
.el-body { font-size: calc(var(--ylf-text-base) * var(--card-type-scale)); line-height: var(--ylf-leading-body); }
.el-literal { white-space: pre-wrap; }
.el-body > :first-child { margin-top: 0; }
.el-body > :last-child { margin-bottom: 0; }
.el-body p, .el-body ul, .el-body ol, .el-body blockquote, .el-body table, .el-code-block { margin: 0 0 var(--ylf-space-6); }
.el-body h1, .el-body h2, .el-body h3, .el-body h4, .el-body h5, .el-body h6 { font-family: var(--card-heading-font); line-height: 1.4; margin: var(--ylf-space-6) 0 var(--ylf-space-3); font-weight: 700; }
.el-body h1 { font-size: calc(var(--ylf-text-xl) * var(--card-type-scale)); } .el-body h2 { font-size: calc(var(--ylf-text-lg) * var(--card-type-scale)); }
.el-body h3 { font-size: calc(var(--ylf-text-base) * var(--card-type-scale)); }
.el-body h4, .el-body h5, .el-body h6 { font-size: calc(var(--ylf-text-sm) * var(--card-type-scale)); }
.el-body strong { font-weight: 700; }
.el-body em { font-style: italic; }
.el-body s { color: var(--muted); }
.el-body ul, .el-body ol { padding-left: var(--ylf-space-8); }
.el-body li + li { margin-top: var(--ylf-space-2); }
.el-body li > p { margin-bottom: var(--ylf-space-2); }
.el-body li > ul, .el-body li > ol { margin: var(--ylf-space-2) 0; }
.el-body blockquote { margin-left: 0; margin-right: 0; padding: var(--ylf-space-3) var(--ylf-space-4); border-left: 3px solid var(--ylf-c-brand); border-radius: 0 var(--ylf-radius-sm) var(--ylf-radius-sm) 0; background: var(--ylf-c-surface-raised); color: var(--ylf-c-text-2); font-size: calc(var(--ylf-text-sm) * var(--card-type-scale)); }
.el-body blockquote > :last-child { margin-bottom: 0; }
.el-body hr { height: 1px; border: 0; background: var(--line); margin: var(--ylf-space-6) 0; }
.el-body code, .el-command, .el-footnote code { font-family: var(--mono); }
.el-body :not(pre) > code { font-size: .92em; padding: 2px var(--ylf-space-1); border: 1px solid var(--line); border-radius: var(--ylf-space-1); background: var(--panel); color: var(--code); }
.el-code-block { border: 1px solid var(--line); border-radius: var(--ylf-radius-sm); background: var(--panel); box-shadow: var(--ylf-shadow-inset); padding: var(--ylf-space-4); }
.el-code-language { color: var(--muted); font: calc(var(--ylf-text-xs) * var(--card-type-scale))/1.4 var(--mono); margin-bottom: var(--ylf-space-3); }
.el-code-block pre { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; tab-size: 4; font: calc(var(--ylf-text-sm) * var(--card-type-scale))/1.6 var(--mono); }
.el-code-block code { font: inherit; }
.el-markdown-link { color: var(--code); text-decoration: underline; }
.el-image-label { color: var(--muted); }
.el-body table { width: 100%; border: 1px solid var(--line); border-radius: var(--ylf-radius-sm); border-collapse: separate; border-spacing: 0; overflow: hidden; table-layout: fixed; font-size: calc(var(--ylf-text-sm) * var(--card-type-scale)); line-height: 1.6; }
.el-body th, .el-body td { padding: var(--ylf-space-3); border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; }
.el-body th { background: var(--ylf-c-surface-raised); font-weight: 700; }
.el-body tr:last-child td { border-bottom: 0; }
.el-links { margin-top: var(--ylf-space-6); color: var(--ylf-c-text-2); font-size: calc(var(--ylf-text-sm) * var(--card-type-scale)); line-height: 1.6; }
.el-footnote { margin: 0; color: var(--ylf-c-text-2); font-size: calc(var(--ylf-text-xs) * var(--card-type-scale)); line-height: 1.6; white-space: pre-wrap; text-wrap: balance; }
.el-footnote code { font-size: .95em; }
.el-help-intro { font-size: calc(var(--ylf-text-base) * var(--card-type-scale)); line-height: var(--ylf-leading-body); margin: 0 0 var(--ylf-space-6); }
.el-help-entry + .el-help-entry { border-top: 1px solid var(--line); margin-top: var(--ylf-space-4); padding-top: var(--ylf-space-4); }
.el-help-command { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--ylf-space-2) var(--ylf-space-4); }
.el-command { color: var(--code); font-size: calc(var(--ylf-text-base) * var(--card-type-scale)); line-height: 1.4; font-weight: 600; }
.el-parameter { color: var(--ylf-c-text-2); font-size: calc(var(--ylf-text-sm) * var(--card-type-scale)); }
.el-help-description { font-size: calc(var(--ylf-text-sm) * var(--card-type-scale)); line-height: var(--ylf-leading-body); margin: var(--ylf-space-2) 0 0; }
.el-help-notes { margin: var(--ylf-space-6) 0; padding: var(--ylf-space-4); background: var(--ylf-c-surface-raised); border: 1px solid var(--line); border-radius: var(--ylf-radius); }
.el-help-notes h2 { margin: 0 0 var(--ylf-space-3); font-family: var(--card-heading-font); font-size: calc(var(--ylf-text-sm) * var(--card-type-scale)); }
.el-help-notes .el-footnote + .el-footnote { margin-top: var(--ylf-space-2); }
@media (max-width: 540px) {
  .el-card-page { padding: var(--ylf-space-3); --card-type-scale: 1.25; }
  .el-card { padding: var(--ylf-space-6) var(--ylf-space-4); }
}
`

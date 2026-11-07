<script setup lang="ts">
import type { PersonaImport, PersonaLibraryState, PersonaPreview, PersonaResult } from '../../persona/src/types'
import type { CuratedPersonaCard } from './persona-market'
import { computed, onMounted, ref, shallowRef } from 'vue'
import dafeiyu from '../../persona/examples/dafeiyu.md?raw'
import personaTemplate from '../../persona/examples/template.md?raw'
import xiaoyun from '../../persona/examples/xiaoyun.md?raw'
import { curatedPersonaImport, curatedPersonaKey, curatedPersonaMarket } from './persona-market'
import { renderPersonaPreview } from './persona-preview'

const examples = [
  { id: 'xiaoyun', name: '小云', icon: '☁', description: '元气、爱代码、擅长休眠', author: 'YunYouJun', license: 'CC-BY-NC-SA-4.0', source: 'YunYouJun/yun · persona/xiaoyun.md', file: 'xiaoyun.md', text: xiaoyun },
  { id: 'dafeiyu', name: '大肥鱼', icon: '🐟', description: '蓝色大肥鱼：DeepSeek 社区二创鲸鱼娘，嘴硬心软、爱吃白饭', author: 'whyever77', license: 'MIT', source: 'whyever77/dafeiyu-astrbot · persona/大肥鱼-人格.md', file: 'dafeiyu.md', text: dafeiyu },
] as const
type ExampleID = (typeof examples)[number]['id']

const instance = ref('DSH 机器人')
const library = shallowRef<PersonaLibraryState>()
const preview = shallowRef<PersonaPreview>()
const exampleID = ref<ExampleID | undefined>('xiaoyun')
const busy = ref(false)
const marketBusy = ref('')
const error = ref('')
const notice = ref('')
const kind = ref<'file' | 'url' | 'git'>('file')
const location = ref('')
const repositoryPath = ref('persona/xiaoyun.md')
const gitRef = ref('HEAD')
const blocked = computed(() => busy.value)
const exampleCard = computed(() => examples.find(item => item.id === exampleID.value))
const availableExamples = computed(() => examples.filter(item => !library.value?.cards.some(card => card.metadata.id === item.id)))
const body = computed(() => exampleCard.value ? exampleCard.value.text.replace(/^---\n[\s\S]*?\n---\n/, '').trim() : preview.value?.body ?? '')
const rendered = computed(() => renderPersonaPreview(body.value))
const card = computed(() => library.value?.cards.find(card => card.metadata.id === preview.value?.metadata.id))
const enabled = computed(() => !exampleCard.value && !!preview.value && library.value?.active?.id === preview.value.metadata.id && library.value.active.hash === preview.value.hash)
const importedMarketSources = computed(() => {
  const sources = new Set<string>()
  for (const card of library.value?.cards ?? []) {
    for (const revision of card.revisions) {
      if (revision.source.kind === 'git')
        sources.add(`${revision.source.repository}\n${revision.source.path}`)
    }
  }
  return sources
})
const activeName = computed(() => {
  const state = library.value
  if (!state)
    return '尚未读取'
  return state.cards.find(card => card.metadata.id === state.active?.id)?.revisions.find(revision => revision.hash === state.active?.hash)?.metadata.name ?? '默认助手'
})
const source = computed(() => {
  if (exampleCard.value)
    return exampleCard.value.source
  const value = preview.value?.source
  return !value ? '' : value.kind === 'git' ? `${value.repository} · ${value.path} @ ${value.commit.slice(0, 8)}` : value.kind === 'file' ? value.path : value.kind === 'url' ? value.url : preview.value?.metadata.homepage || value.name
})

async function perform(operation: 'list' | 'import' | 'preview' | 'use' | 'disable' | 'update', id?: string, revision?: string, input?: PersonaImport) {
  if (blocked.value)
    return
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    const result = await request({ operation, id, revision, input })
    instance.value = result.instance.title
    library.value = result.library
    if (result.preview) {
      preview.value = result.preview
      exampleID.value = undefined
    }
    if (operation === 'use' || operation === 'disable')
      notice.value = '已保存。下一条任务将开始新会话，当前任务会继续完成。'
    if (operation === 'import' || operation === 'update')
      notice.value = '人物卡已保存到此机器人。预览后点击「启用此版本」即可使用。'
    if (operation === 'list') {
      if (result.library.active) {
        const selected = await request({ operation: 'preview', id: result.library.active.id, revision: result.library.active.hash })
        preview.value = selected.preview
        exampleID.value = undefined
      }
      else if (exampleID.value && result.library.cards.some(card => card.metadata.id === exampleID.value)) {
        exampleID.value = examples.find(item => !result.library.cards.some(card => card.metadata.id === item.id))?.id
      }
    }
  }
  catch (e) { error.value = String(e) }
  finally { busy.value = false }
}
onMounted(() => {
  void perform('list')
})

async function request(input: object): Promise<PersonaResult & { instance: { title: string } }> {
  const response = await fetch('/el-bot/personas/api', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-el-bot-persona': '1' }, body: JSON.stringify(input) })
  const reply = await response.json()
  if (!response.ok || !reply.ok)
    throw new Error(reply.error || '无法读取人物卡。请从 DSH 登录入口重新连接。')
  return reply.result
}

function showDefault() {
  preview.value = undefined
  exampleID.value = undefined
  notice.value = ''
}
function showExample(id: ExampleID) {
  preview.value = undefined
  exampleID.value = id
  notice.value = ''
}
async function importLocation() {
  if (kind.value === 'file')
    return
  const input: PersonaImport = kind.value === 'url' ? { kind: 'url', url: location.value.trim() } : { kind: 'git', repository: location.value.trim(), path: repositoryPath.value.trim(), ref: gitRef.value.trim() || 'HEAD' }
  await perform('import', undefined, undefined, input)
}
async function importFile(event: Event) {
  const element = event.target as HTMLInputElement
  const file = element.files?.[0]
  if (!file || blocked.value)
    return
  try {
    if (file.size > 32 * 1024)
      throw new Error('人物卡不能超过 32 KiB。')
    const text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
    await perform('import', undefined, undefined, { kind: 'text', name: file.name, text })
  }
  catch (e) { error.value = String(e) }
  finally { element.value = '' }
}
async function importMarketPersona(item: CuratedPersonaCard) {
  if (blocked.value)
    return
  marketBusy.value = item.path
  try {
    await perform('import', undefined, undefined, curatedPersonaImport(item))
  }
  finally { marketBusy.value = '' }
}
function marketPersonaImported(item: CuratedPersonaCard) {
  return importedMarketSources.value.has(curatedPersonaKey(item))
}
function changeRevision(event: Event) {
  void perform('preview', preview.value?.metadata.id, (event.target as HTMLSelectElement).value)
}
function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([personaTemplate], { type: 'text/markdown;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'persona-template.md'
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}
</script>

<template>
  <section class="personas" aria-label="人物卡管理" :aria-busy="busy">
    <header class="page-heading">
      <div><h1>人物卡</h1><p>管理此机器人的人物设定，预览后启用。</p></div>
    </header>
    <section class="dsh-section persona-current">
      <div><span class="persona-eyebrow">当前人设 · {{ instance }}</span><h2>{{ activeName }}</h2><p>用于此 DSH 实例的 QQ 机器人。切换后下一次任务准入开始新会话，当前任务会继续完成。</p></div>
      <button type="button" class="dsh-button" data-variant="outline" data-size="sm" :disabled="blocked" @click="perform('list')">
        刷新人物卡
      </button>
    </section>
    <p v-if="error" class="error" role="alert">
      {{ error }}
    </p>
    <p v-if="notice" class="notice" role="status">
      {{ notice }}
    </p>
    <div class="persona-layout">
      <section class="dsh-section persona-collection">
        <h2>我的人物卡</h2>
        <button class="persona-choice" :aria-pressed="!exampleCard && !preview" @click="showDefault">
          <strong>✧ 默认助手</strong><small>使用任务程序原有风格</small>
        </button>
        <button v-for="item in library?.cards ?? []" :key="item.metadata.id" class="persona-choice" :aria-label="`预览 ${item.metadata.name}`" :aria-pressed="!exampleCard && preview?.metadata.id === item.metadata.id" :disabled="blocked" @click="perform('preview', item.metadata.id)">
          <strong>{{ item.metadata.name }} <small v-if="library?.active?.id === item.metadata.id">已启用</small></strong><small>{{ item.metadata.description || '查看人物设定' }}</small>
        </button>
        <template v-if="availableExamples.length">
          <p class="persona-eyebrow">
            从一个角色开始
          </p><button v-for="item in availableExamples" :key="item.id" class="persona-choice" :aria-pressed="exampleCard?.id === item.id" @click="showExample(item.id)">
            <strong>{{ item.icon }} {{ item.name }} · 示例</strong><small>{{ item.description }}</small>
          </button>
        </template>
      </section>
      <section class="dsh-section persona-preview">
        <div class="section-heading">
          <div><span class="persona-eyebrow">{{ exampleCard ? '示例 · 尚未导入' : enabled ? '正在使用' : preview ? '人物卡预览' : '默认风格' }}</span><h2>{{ exampleCard?.name ?? preview?.metadata.name ?? '默认助手' }}</h2></div>
          <button v-if="exampleCard" type="button" class="dsh-button" :disabled="blocked" @click="perform('import', undefined, undefined, { kind: 'text', name: exampleCard.file, text: exampleCard.text })">
            导入{{ exampleCard.name }}示例
          </button>
          <button v-else-if="preview" type="button" class="dsh-button" :disabled="blocked || enabled" @click="perform('use', preview.metadata.id, preview.hash)">
            {{ enabled ? '已启用此版本' : '启用此版本' }}
          </button>
          <button v-else type="button" class="dsh-button" :disabled="blocked || !library?.active" @click="perform('disable')">
            使用默认人设
          </button>
        </div>
        <template v-if="body">
          <p>{{ exampleCard?.description ?? preview?.metadata.description }}</p>
          <div class="persona-meta">
            <span>{{ exampleCard?.author || preview?.metadata.author || '作者未注明' }}</span><span>{{ exampleCard?.license || preview?.metadata.license || '许可证未注明' }}</span>
          </div>
          <div v-if="preview && card?.revisions.length" class="persona-revisions">
            <label for="persona-revision">预览版本</label><select id="persona-revision" class="form-input" :value="preview.hash" :disabled="blocked" @change="changeRevision">
              <option v-for="revision in card.revisions" :key="revision.hash" :value="revision.hash">
                {{ revision.metadata.version || new Date(revision.importedAt).toLocaleString() }} · {{ revision.hash.slice(0, 8) }}
              </option>
            </select><button v-if="card.source.kind !== 'text'" type="button" class="dsh-button" data-variant="outline" data-size="sm" :disabled="blocked" @click="perform('update', preview.metadata.id)">
              检查更新
            </button>
          </div>
          <p class="persona-source">
            来源：{{ source }}
          </p>
          <!-- Renderer disables raw HTML, active links, and image requests. -->
          <div class="persona-markdown" v-html="rendered" />
        </template>
        <p v-else class="default-description">
          保留任务程序原有的回答风格。你也可以导入一张人物卡，让助手拥有自己的设定和说话方式。
        </p>
      </section>
    </div>
    <section class="dsh-section persona-market">
      <div class="section-heading">
        <div>
          <span class="persona-eyebrow">精选人设 · DSH 人设广场</span><h2>从社区挑一张</h2>
          <p>目录随插件静态审核，逐卡保留作者与许可。点击后从公开 Git 导入并停在此处预览，不会自动启用。</p>
        </div>
        <a class="dsh-button persona-market-link" data-variant="outline" :href="curatedPersonaMarket.browseURL" target="_blank" rel="noopener noreferrer">
          浏览完整广场
        </a>
      </div>
      <div class="persona-market-grid">
        <article v-for="item in curatedPersonaMarket.cards" :key="item.path" class="persona-market-card">
          <div class="persona-market-heading">
            <div><h3>{{ item.name }}</h3><span>@{{ item.author }}</span></div>
            <span class="persona-market-license">{{ item.license }}</span>
          </div>
          <p>{{ item.summary }}</p>
          <div class="persona-market-tags" aria-label="人物卡标签">
            <span v-for="tag in item.tags" :key="tag">{{ tag }}</span>
          </div>
          <button type="button" class="dsh-button" data-variant="outline" data-size="sm" :disabled="blocked" :aria-label="`导入并预览 ${item.name}`" @click="importMarketPersona(item)">
            {{ marketBusy === item.path ? '正在导入…' : marketPersonaImported(item) ? '重新导入并预览' : '导入并预览' }}
          </button>
        </article>
      </div>
      <p class="persona-market-note">
        审核于 {{ curatedPersonaMarket.reviewedAt }} · 基线 {{ curatedPersonaMarket.reviewedCommit.slice(0, 8) }} · 上游 {{ curatedPersonaMarket.ref }}。每次导入会记录实际 commit，之后可用「检查更新」获取新版。
      </p>
    </section>
    <section class="dsh-section">
      <form class="settings-form persona-import" @submit.prevent="importLocation">
        <h2>导入人物卡</h2><p>支持 Markdown 和可选的 YAML 元数据。导入保存到此机器人，预览后再启用。</p>
        <div class="persona-template">
          <span>还没有人物卡？下载基础模板，让 AI 填写或手动改写后再上传。</span>
          <button type="button" class="dsh-button" data-variant="outline" data-size="sm" @click="downloadTemplate">
            下载基础模板
          </button>
        </div>
        <div class="persona-import-fields">
          <label>导入方式<select v-model="kind" class="form-input" :disabled="blocked" @change="location = ''"><option value="file">上传文件</option><option value="url">在线链接</option><option value="git">Git 仓库</option></select></label><label v-if="kind !== 'file'">{{ kind === 'url' ? 'Markdown 原文链接' : 'Git 仓库地址' }}<input v-model="location" class="form-input" :disabled="blocked" required :placeholder="kind === 'url' ? 'https://example.com/persona.md' : 'https://github.com/YunYouJun/yun.git'"></label><template v-if="kind === 'git'">
            <label>仓库内文件<input v-model="repositoryPath" class="form-input" :disabled="blocked" required placeholder="persona/xiaoyun.md"></label><label>分支、标签或提交<input v-model="gitRef" class="form-input" :disabled="blocked" placeholder="HEAD"></label>
          </template>
        </div>
        <div class="actions settings-actions">
          <button v-if="kind !== 'file'" type="submit" class="dsh-button" data-variant="outline" :disabled="blocked || !location.trim()">
            {{ busy ? '处理中…' : '导入并预览' }}
          </button><label v-if="kind === 'file'" class="persona-file-picker">选择本机文件<input type="file" accept=".md,.markdown,text/markdown,text/plain" :disabled="blocked" @change="importFile"></label>
        </div>
      </form>
    </section>
  </section>
</template>

<style scoped>
.persona-current,
.persona-meta,
.persona-revisions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--bot-space-3);
}
.persona-current {
  justify-content: space-between;
}
.persona-current h2,
.persona-preview h2 {
  margin: var(--bot-space-1) 0 0;
  font-size: var(--bot-text-base);
}
.persona-current p,
.persona-preview p {
  font-size: var(--bot-text-sm);
}
.persona-eyebrow,
.persona-meta,
.persona-source {
  color: var(--bot-muted);
  font-size: var(--bot-text-xs);
}
.persona-layout {
  display: grid;
  grid-template-columns: 224px minmax(0, 1fr);
  align-items: start;
  gap: var(--bot-space-4);
}
.persona-collection h2 {
  margin-top: 0;
  font-size: var(--bot-text-sm);
}
.persona-choice {
  display: block;
  width: 100%;
  padding: var(--bot-space-3);
  margin-top: var(--bot-space-2);
  text-align: left;
  border: 0.5px solid transparent;
  border-radius: var(--bot-radius);
  color: var(--bot-text);
  background: transparent;
  overflow-wrap: anywhere;
}
.persona-choice:hover:not(:disabled) {
  background: var(--bot-hover);
}
.persona-choice[aria-pressed='true'] {
  background: var(--bot-selected);
}
.persona-choice strong {
  font-size: var(--bot-text-sm);
  font-weight: 500;
}
.persona-choice small {
  display: block;
  margin-top: var(--bot-space-1);
  font-size: var(--bot-text-xs);
  color: var(--bot-muted);
  font-weight: 400;
}
.persona-choice strong small {
  display: inline;
  color: var(--bot-accent);
}
.persona-preview {
  min-width: 0;
}
.persona-source {
  overflow-wrap: anywhere;
}
.persona-revisions {
  margin-top: var(--bot-space-4);
  font-size: var(--bot-text-xs);
}
.persona-revisions select {
  width: auto;
  max-width: 100%;
  flex: 1;
  font-size: var(--bot-text-xs);
}
.persona-markdown {
  max-height: 420px;
  overflow-y: auto;
  margin-top: var(--bot-space-4);
  padding-top: var(--bot-space-4);
  border-top: 1px solid var(--bot-border);
  overflow-wrap: anywhere;
  font-size: var(--dsh-content-font-size, var(--bot-text-base));
  line-height: var(--bot-leading);
}
.persona-markdown :deep(h1) {
  font-size: var(--bot-text-lg);
}
.persona-markdown :deep(h2) {
  font-size: var(--bot-text-base);
  margin-top: var(--bot-space-6);
}
.persona-markdown :deep(pre) {
  white-space: pre-wrap;
}
.persona-markdown :deep(code) {
  font-family: var(--ds-font-family-code, monospace);
}
.persona-markdown :deep(blockquote) {
  margin-inline: 0;
  padding-left: var(--bot-space-3);
  border-left: 2px solid var(--bot-border);
}
.persona-import {
  max-width: none;
}
.persona-market-link {
  flex: none;
  text-decoration: none;
}
.persona-market-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: var(--bot-space-3);
  margin-top: var(--bot-space-4);
}
.persona-market-card {
  display: flex;
  flex-direction: column;
  gap: var(--bot-space-2);
  min-width: 0;
  padding: var(--bot-space-4);
  border: 0.5px solid var(--bot-border);
  border-radius: var(--bot-radius);
  background: var(--bot-input-bg);
}
.persona-market-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--bot-space-2);
}
.persona-market-heading h3 {
  margin: 0;
}
.persona-market-heading div > span,
.persona-market-note {
  color: var(--bot-muted);
  font-size: var(--bot-text-xs);
}
.persona-market-license {
  flex: none;
  padding: 1px 7px;
  border: 0.5px solid var(--bot-border);
  border-radius: 999px;
  color: var(--bot-secondary);
  font-size: 11px;
}
.persona-market-card > p {
  flex: 1;
  margin: 0;
  font-size: var(--bot-text-sm);
}
.persona-market-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--bot-space-1);
}
.persona-market-tags span {
  padding: 0 6px;
  border-radius: 999px;
  color: var(--bot-muted);
  background: var(--bot-hover);
  font-size: 11px;
}
.persona-market-card > .dsh-button {
  width: 100%;
  margin-top: var(--bot-space-1);
}
.persona-market-note {
  margin: var(--bot-space-4) 0 0;
}
.persona-template {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--bot-space-3);
  margin-top: var(--bot-space-3);
  font-size: var(--bot-text-xs);
  color: var(--bot-muted);
}
.persona-import-fields {
  display: grid;
  grid-template-columns: 170px minmax(0, 1fr);
  gap: var(--bot-space-4);
}
.persona-import-fields label {
  margin-top: var(--bot-space-3);
}
.settings-form .persona-file-picker {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--bot-space-2);
  margin: 0;
  font-size: var(--bot-text-xs);
}
.persona-file-picker input {
  max-width: 230px;
  font-size: var(--bot-text-xs);
}
.default-description {
  min-height: 100px;
}
@media (max-width: 760px) {
  .persona-layout {
    grid-template-columns: 1fr;
  }
  .persona-collection {
    display: flex;
    flex-wrap: wrap;
    gap: var(--bot-space-2);
  }
  .persona-collection h2,
  .persona-collection > p {
    width: 100%;
  }
  .persona-choice {
    flex: 1;
    min-width: 170px;
  }
}
@media (max-width: 600px) {
  .persona-import-fields {
    grid-template-columns: 1fr;
    gap: var(--bot-space-2);
  }
}
</style>

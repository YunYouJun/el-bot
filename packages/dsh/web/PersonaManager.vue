<script setup lang="ts">
import type { PersonaImport, PersonaLibraryState, PersonaPreview, PersonaResult } from '../../persona/src/types'
import { computed, onMounted, ref, shallowRef } from 'vue'
import xiaoyun from '../../persona/examples/xiaoyun.md?raw'
import { renderPersonaPreview } from './persona-preview'

const instance = ref('DSH 机器人')
const library = shallowRef<PersonaLibraryState>()
const preview = shallowRef<PersonaPreview>()
const example = ref(true)
const busy = ref(false)
const error = ref('')
const notice = ref('')
const kind = ref<'file' | 'url' | 'git'>('file')
const location = ref('')
const repositoryPath = ref('persona/xiaoyun.md')
const gitRef = ref('HEAD')
const blocked = computed(() => busy.value)
const body = computed(() => example.value ? xiaoyun.replace(/^---\n[\s\S]*?\n---\n/, '').trim() : preview.value?.body ?? '')
const rendered = computed(() => renderPersonaPreview(body.value))
const card = computed(() => library.value?.cards.find(card => card.metadata.id === preview.value?.metadata.id))
const enabled = computed(() => !example.value && !!preview.value && library.value?.active?.id === preview.value.metadata.id && library.value.active.hash === preview.value.hash)
const activeName = computed(() => {
  const state = library.value
  if (!state)
    return '尚未读取'
  return state.cards.find(card => card.metadata.id === state.active?.id)?.revisions.find(revision => revision.hash === state.active?.hash)?.metadata.name ?? '默认助手'
})
const source = computed(() => {
  if (example.value)
    return 'YunYouJun/yun · persona/xiaoyun.md'
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
      example.value = false
    }
    if (operation === 'use' || operation === 'disable')
      notice.value = '已保存。下一条任务将开始新会话，当前任务会继续完成。'
    if (operation === 'import' || operation === 'update')
      notice.value = '人物卡已保存到此机器人。预览后点击「启用此版本」即可使用。'
    if (operation === 'list' && result.library.active) {
      const selected = await request({ operation: 'preview', id: result.library.active.id, revision: result.library.active.hash })
      preview.value = selected.preview
      example.value = false
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
  example.value = false
  notice.value = ''
}
function showExample() {
  preview.value = undefined
  example.value = true
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
function changeRevision(event: Event) {
  void perform('preview', preview.value?.metadata.id, (event.target as HTMLSelectElement).value)
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
        <button class="persona-choice" :aria-pressed="!example && !preview" @click="showDefault">
          <strong>✧ 默认助手</strong><small>使用任务程序原有风格</small>
        </button>
        <button v-for="item in library?.cards ?? []" :key="item.metadata.id" class="persona-choice" :aria-label="`预览 ${item.metadata.name}`" :aria-pressed="!example && preview?.metadata.id === item.metadata.id" :disabled="blocked" @click="perform('preview', item.metadata.id)">
          <strong>{{ item.metadata.name }} <small v-if="library?.active?.id === item.metadata.id">已启用</small></strong><small>{{ item.metadata.description || '查看人物设定' }}</small>
        </button>
        <template v-if="!library?.cards.some(item => item.metadata.id === 'xiaoyun')">
          <p class="persona-eyebrow">
            从一个角色开始
          </p><button class="persona-choice" :aria-pressed="example" @click="showExample">
            <strong>☁ 小云 · 示例</strong><small>元气、爱代码、擅长休眠</small>
          </button>
        </template>
      </section>
      <section class="dsh-section persona-preview">
        <div class="section-heading">
          <div><span class="persona-eyebrow">{{ example ? '示例 · 尚未导入' : enabled ? '正在使用' : preview ? '人物卡预览' : '默认风格' }}</span><h2>{{ example ? '小云' : preview?.metadata.name ?? '默认助手' }}</h2></div>
          <button v-if="example" type="button" class="dsh-button" :disabled="blocked" @click="perform('import', undefined, undefined, { kind: 'text', name: 'xiaoyun.md', text: xiaoyun })">
            导入小云示例
          </button>
          <button v-else-if="preview" type="button" class="dsh-button" :disabled="blocked || enabled" @click="perform('use', preview.metadata.id, preview.hash)">
            {{ enabled ? '已启用此版本' : '启用此版本' }}
          </button>
          <button v-else type="button" class="dsh-button" :disabled="blocked || !library?.active" @click="perform('disable')">
            使用默认人设
          </button>
        </div>
        <template v-if="body">
          <p>{{ example ? '诞生于互联网的元气机械少女，爱代码，也擅长休眠。' : preview?.metadata.description }}</p>
          <div class="persona-meta">
            <span>{{ example ? 'YunYouJun' : preview?.metadata.author || '作者未注明' }}</span><span>{{ example ? 'CC-BY-NC-SA-4.0' : preview?.metadata.license || '许可证未注明' }}</span>
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
    <section class="dsh-section">
      <form class="settings-form persona-import" @submit.prevent="importLocation">
        <h2>导入人物卡</h2><p>支持 Markdown 和可选的 YAML 元数据。导入保存到此机器人，预览后再启用。</p>
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

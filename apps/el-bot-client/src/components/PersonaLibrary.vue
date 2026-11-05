<script setup lang="ts">
import type { DshPersonaResult } from '../../../../packages/dsh/src/types'
import type { CloudSettings } from '../types'
import { invoke, isTauri } from '@tauri-apps/api/core'
import YlfButton from '@yunlefun/vue/components/YlfButton.vue'
import YlfCard from '@yunlefun/vue/components/YlfCard.vue'
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'

const props = defineProps<{ cloud?: CloudSettings, disabled: boolean }>()
const result = shallowRef<DshPersonaResult>()
const busy = ref(false)
const error = ref('')
const notice = ref('')
const selection = ref('default')
const blocked = computed(() => props.disabled || busy.value || !isTauri() || !props.cloud?.sshHost)
const active = computed(() => {
  const library = result.value?.library
  return library?.cards.find(card => card.metadata.id === library.active?.id)?.revisions.find(revision => revision.hash === library.active?.hash)
})
const options = computed(() => {
  const cards = result.value?.library.cards ?? []
  const values = cards.map(card => ({ value: `${card.metadata.id}:${card.hash}`, name: card.metadata.name }))
  if (active.value && !values.some(option => option.value === `${active.value!.metadata.id}:${active.value!.hash}`))
    values.push({ value: `${active.value.metadata.id}:${active.value.hash}`, name: `${active.value.metadata.name} · 当前历史版本` })
  return values
})
async function act(operation: 'list' | 'use' | 'disable', id?: string, revision?: string) {
  if (blocked.value)
    return
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    result.value = await invoke<DshPersonaResult>('dsh_persona', { operation, id, revision })
    const selected = result.value.library.active
    selection.value = selected ? `${selected.id}:${selected.hash}` : 'default'
    if (operation !== 'list')
      notice.value = '已保存到远端机器人。下一次任务准入生效，当前任务会继续完成。'
  }
  catch (e) { error.value = String(e) }
  finally { busy.value = false }
}
async function change() {
  if (selection.value === 'default') {
    await act('disable')
  }
  else {
    const [id, revision] = selection.value.split(':')
    await act('use', id, revision)
  }
}
async function openManager() {
  if (blocked.value)
    return
  busy.value = true
  error.value = ''
  try {
    await invoke('open_persona_manager')
  }
  catch (e) { error.value = String(e) }
  finally { busy.value = false }
}
function refresh() {
  void act('list')
}
watch(() => props.cloud?.sshHost, () => {
  result.value = undefined
  refresh()
})
onMounted(() => {
  refresh()
  window.addEventListener('focus', refresh)
})
onUnmounted(() => window.removeEventListener('focus', refresh))
</script>

<template>
  <YlfCard :hoverable="false" class="persona-summary">
    <div class="section-heading">
      <div>
        <p class="footnote">
          远端机器人 · {{ cloud?.sshHost || '尚未配置连接' }}
        </p><h2>当前人设</h2>
      </div>
      <YlfButton size="sm" variant="secondary" :disabled="blocked" @click="refresh">
        刷新人设
      </YlfButton>
    </div>
    <p v-if="error" class="error" role="alert">
      {{ error }}
    </p>
    <template v-if="result">
      <h3>{{ active?.metadata.name ?? '默认助手' }}</h3>
      <p>{{ active?.metadata.description || '使用此机器人任务程序的原有风格。' }}</p>
      <label for="persona-quick-switch">快捷切换人设</label>
      <select id="persona-quick-switch" v-model="selection" class="form-input" :disabled="blocked" @change="change">
        <option value="default">
          默认助手
        </option>
        <option v-for="option in options" :key="option.value" :value="option.value">
          {{ option.name }}
        </option>
      </select>
      <p class="footnote">
        切换作用于此远端实例的 QQ 机器人；下一次任务准入开始新会话。
      </p>
    </template>
    <p v-else-if="busy" role="status">
      正在读取远端人设…
    </p>
    <p v-else>
      在 DSH Web 中导入、预览和管理人物卡，客户端同步显示当前人设。
    </p>
    <p v-if="notice" class="notice" role="status">
      {{ notice }}
    </p>
    <div class="actions">
      <YlfButton :disabled="blocked" @click="openManager">
        前往 Web 管理人物卡
      </YlfButton>
    </div>
    <p v-if="!cloud?.sshHost" class="footnote">
      请先在高级设置中填写已有的 SSH 主机别名。
    </p>
  </YlfCard>
</template>

<style scoped>
.persona-summary {
  max-width: 780px;
}
h2 {
  margin: 0;
  font-size: var(--ylf-text-base);
}
h3 {
  margin: var(--ylf-space-6) 0 var(--ylf-space-2);
  font-size: var(--ylf-text-xl);
}
label {
  display: block;
  margin: var(--ylf-space-6) 0 var(--ylf-space-2);
  font-size: var(--ylf-text-sm);
}
.actions {
  margin-top: var(--ylf-space-6);
}
</style>

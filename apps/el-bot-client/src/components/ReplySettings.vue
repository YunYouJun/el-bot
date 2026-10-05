<script setup lang="ts">
import type { ReplyPreferences } from '../types'
import YlfButton from '@yunlefun/vue/components/YlfButton.vue'
import YlfCard from '@yunlefun/vue/components/YlfCard.vue'
import YlfSelect from '@yunlefun/vue/components/YlfSelect.vue'
import { reactive, watch } from 'vue'

const props = defineProps<{ preferences?: ReplyPreferences, disabled: boolean }>()
const emit = defineEmits<{ save: [preferences: ReplyPreferences] }>()
const form = reactive<ReplyPreferences>({ messageFormat: 'markdown', imageTheme: 'light', restartRequired: false })
const formats = [
  { value: 'image', label: '展示图片卡片' },
  { value: 'markdown', label: 'Markdown 卡片（不展示图片）' },
  { value: 'text', label: '纯文本（不展示图片）' },
] as const
const themes = [{ value: 'light', label: '浅色' }, { value: 'dark', label: '深色' }] as const
watch(() => props.preferences, (value) => {
  if (value)
    Object.assign(form, value)
}, { immediate: true })
</script>

<template>
  <YlfCard class="reply-settings" :hoverable="false">
    <form class="settings-form" @submit.prevent="emit('save', { ...form })">
      <h2>QQ 回复展示</h2>
      <p>选择是否把任务状态、结果与帮助渲染为图片。</p>
      <label for="reply-format">回复格式</label>
      <YlfSelect id="reply-format" v-model="form.messageFormat" :options="formats" :disabled="disabled || !preferences" />
      <template v-if="form.messageFormat === 'image'">
        <label for="reply-theme">图片主题</label>
        <YlfSelect id="reply-theme" v-model="form.imageTheme" :options="themes" :disabled="disabled" />
      </template>
      <div class="settings-actions">
        <YlfButton variant="secondary" type="submit" :disabled="disabled || !preferences">
          保存展示设置
        </YlfButton>
      </div>
      <p v-if="preferences?.restartRequired" role="status">
        已保存。等待任务完成后，在机器人页面重启即可生效。
      </p>
      <p v-else>
        保存到当前机器人配置；下次启动生效。
      </p>
    </form>
  </YlfCard>
</template>

<style scoped>
.reply-settings {
  margin-top: var(--ylf-space-6);
}
</style>

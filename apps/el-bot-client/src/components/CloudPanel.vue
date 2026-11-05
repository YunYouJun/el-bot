<script setup lang="ts">
import type { CloudSettings } from '../types'
import YlfButton from '@yunlefun/vue/components/YlfButton.vue'
import YlfCard from '@yunlefun/vue/components/YlfCard.vue'
import { shallowRef, watch } from 'vue'

const props = defineProps<{ settings?: CloudSettings, disabled: boolean, editable?: boolean }>()
const emit = defineEmits<{ open: [], configure: [], save: [settings: CloudSettings] }>()
const host = shallowRef('')
watch(() => props.settings, value => host.value = value?.sshHost ?? '', { immediate: true })
</script>

<template>
  <YlfCard :hoverable="false">
    <h2>云端机器人</h2>
    <p>在 Web 中查看会话、切换模型和管理分组。机器人在云端持续运行。</p>
    <form v-if="editable" class="settings-form" @submit.prevent="emit('save', { sshHost: host.trim() })">
      <label>SSH 主机别名<input v-model="host" class="form-input" required :disabled="disabled" placeholder="例如 yunlefun" spellcheck="false" autocomplete="off"></label>
      <p class="footnote">
        使用本机已有 SSH 密钥建立专用连接，浏览器页面独立于客户端。
      </p>
      <YlfButton type="submit" :disabled="disabled">
        保存云端连接
      </YlfButton>
    </form>
    <div v-else class="actions">
      <YlfButton :disabled="disabled || !settings?.sshHost" @click="emit('open')">
        打开云端 DSH
      </YlfButton>
      <YlfButton variant="secondary" :disabled="disabled" @click="emit('configure')">
        {{ settings?.sshHost ? '连接设置' : '配置云端连接' }}
      </YlfButton>
      <span v-if="settings?.sshHost" class="footnote">{{ settings.sshHost }}</span>
    </div>
  </YlfCard>
</template>

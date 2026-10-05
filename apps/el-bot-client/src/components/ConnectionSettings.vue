<script setup lang="ts">
import type { ClientSettings } from '../types'
import YlfButton from '@yunlefun/vue/components/YlfButton.vue'
import YlfCard from '@yunlefun/vue/components/YlfCard.vue'
import { reactive, watch } from 'vue'

const props = defineProps<{ settings?: ClientSettings, disabled: boolean }>()
const emit = defineEmits<{ save: [settings: ClientSettings] }>()
const fields = { nodePath: 'Node 可执行文件', cliPath: 'el-bot CLI 文件', configPath: '机器人配置', credentialsPath: '凭据文件', statePath: '会话状态文件' }
const form = reactive<ClientSettings>({ nodePath: '', cliPath: '', configPath: '', credentialsPath: '', statePath: '', codexAppPath: '', qqAppPath: '' })
watch(() => props.settings, (value) => {
  if (value)
    Object.assign(form, value)
}, { immediate: true })
</script>

<template>
  <YlfCard :hoverable="false">
    <form class="settings-form" @submit.prevent="emit('save', { ...form })">
      <h2>运行环境</h2>
      <p>填写已有文件的完整路径，控制台与菜单栏共用此设置。</p>
      <label v-for="(label, key) in fields" :key="key">{{ label }}<input v-model="form[key]" class="form-input" required :disabled="disabled" spellcheck="false" autocomplete="off"></label>
      <label>Codex 应用路径（可选）<input v-model="form.codexAppPath" class="form-input" :disabled="disabled" spellcheck="false" placeholder="macOS 留空自动查找已安装应用"></label>
      <label>QQ 应用路径（可选）<input v-model="form.qqAppPath" class="form-input" :disabled="disabled" spellcheck="false" placeholder="macOS 留空自动查找已安装应用"></label>
      <YlfButton type="submit" :disabled="disabled">
        保存并连接
      </YlfButton>
    </form>
  </YlfCard>
</template>

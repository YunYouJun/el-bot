<script setup lang="ts">
import { computed, shallowRef } from 'vue'
import CodexConversation from './CodexConversation.vue'
import { scenarios } from './scenarios'

const selected = shallowRef(scenarios[0].id)
const active = computed(() => scenarios.find(scenario => scenario.id === selected.value) ?? scenarios[0])
</script>

<template>
  <section class="codex-showcase" aria-label="QQ 遥控 Codex 功能展示">
    <div class="scenario-picker">
      <h2 class="showcase-title">
        把任务发到 QQ，<br>让本机 Codex 接着做。
      </h2>
      <p class="showcase-intro">
        离开电脑，也能安排工作、确认操作和查看结果。电脑与遥控服务需要保持在线。
      </p>
      <div class="scenario-buttons" aria-label="选择示例场景">
        <button
          v-for="scenario in scenarios" :key="scenario.id" type="button" class="scenario-button"
          :aria-pressed="selected === scenario.id" aria-controls="codex-example"
          @click="selected = scenario.id"
        >
          {{ scenario.title }}
        </button>
      </div>
      <p class="scenario-description">
        {{ active.description }}
      </p>
      <p class="showcase-note">
        以下为交互示例，任务与审批编号为虚构，按钮仅示意。色彩以 QQ 客户端实际显示为准。<br>真实私聊收发与会话续聊已完成联调。
      </p>
    </div>
    <div id="codex-example" aria-live="polite" aria-atomic="true">
      <CodexConversation :messages="active.messages" />
    </div>
  </section>
</template>

<style scoped>
.codex-showcase {
  display: grid;
  grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
  gap: 48px;
  margin: 32px auto 48px;
  text-align: left;
}
.scenario-picker {
  padding-top: 24px;
}
.showcase-title {
  margin: 0 0 20px;
  border: 0;
  padding: 0;
  color: var(--vp-c-text-1);
  font-size: clamp(24px, 2.8vw, 34px);
  line-height: 1.4;
  letter-spacing: -0.5px;
}
.showcase-intro {
  margin: 0;
  color: var(--vp-c-text-2);
  line-height: 1.8;
}
.scenario-buttons {
  display: grid;
  gap: 6px;
  margin: 28px 0 20px;
}
.scenario-button {
  padding: 12px 16px;
  border-left: 3px solid var(--vp-c-divider);
  border-radius: 0 6px 6px 0;
  color: var(--vp-c-text-2);
  font-size: 16px;
  text-align: left;
  cursor: pointer;
}
.scenario-button[aria-pressed='true'] {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
  font-weight: 600;
}
.scenario-button:hover {
  color: var(--vp-c-brand-1);
}
.scenario-button:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 3px;
}
.scenario-description {
  min-height: 84px;
  margin: 0;
  line-height: 1.8;
}
.showcase-note {
  margin: 24px 0 0;
  font-size: 12px;
  line-height: 1.8;
  color: var(--vp-c-text-2);
}
@media (max-width: 760px) {
  .codex-showcase {
    grid-template-columns: minmax(0, 1fr);
    gap: 24px;
  }
  .scenario-picker {
    padding-top: 0;
  }
  .scenario-buttons {
    display: flex;
    gap: 8px;
  }
  .scenario-button {
    flex: 1;
    padding: 10px 4px;
    border-left: 0;
    border-bottom: 3px solid var(--vp-c-divider);
    text-align: center;
  }
  .scenario-description {
    min-height: 0;
  }
}
</style>

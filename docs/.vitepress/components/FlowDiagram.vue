<template>
  <figure
    class="flow"
    role="img"
    aria-label="消息从 QQ、小云客户端或 Web 进入小云与 el-bot 的会话层，完成鉴权、会话路由和审批后交给 Codex、CodeBuddy 或 DSH 执行，结果按同一会话 ID 回传。"
  >
    <div class="flow-row">
      <div class="flow-node">
        <span class="flow-step">01</span>
        <strong>入口</strong>
        <span class="flow-detail">QQ · 小云客户端 · Web</span>
      </div>
      <div class="flow-edge" aria-hidden="true"><i class="packet" /></div>
      <div class="flow-node">
        <span class="flow-step">02</span>
        <strong>会话层</strong>
        <span class="flow-detail">鉴权 · 路由 · 审批</span>
      </div>
      <div class="flow-edge" aria-hidden="true"><i class="packet" /></div>
      <div class="flow-node">
        <span class="flow-step">03</span>
        <strong>执行层</strong>
        <span class="flow-detail">Codex · CodeBuddy · DSH</span>
      </div>
    </div>
    <div class="flow-return" aria-hidden="true">
      <i class="packet back" />
      <span>结果与历史按同一会话 ID 回传</span>
    </div>
  </figure>
</template>

<style scoped>
.flow {
  margin: 24px 0 0;
  padding: 24px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 20px;
  background: var(--vp-c-bg-soft);
}

.flow-row {
  display: grid;
  grid-template-columns: 1fr 64px 1fr 64px 1fr;
  align-items: stretch;
}

.flow-node {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 16px;
  background: var(--vp-c-bg);
}

.flow-step {
  color: var(--vp-c-brand-1);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
}

.flow-node strong {
  font-size: 15px;
  line-height: 1.4;
}

.flow-detail {
  color: var(--vp-c-text-2);
  font-size: 13px;
  line-height: 1.5;
}

.flow-edge {
  position: relative;
  align-self: center;
  height: 2px;
}

.flow-edge::before {
  content: "";
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(90deg, var(--vp-c-divider) 0 5px, transparent 5px 10px);
}

.packet {
  position: absolute;
  top: 50%;
  left: 0;
  width: 8px;
  height: 8px;
  margin-top: -4px;
  border-radius: 50%;
  background: var(--vp-c-brand-1);
  box-shadow: 0 0 0 3px var(--vp-c-brand-soft);
  animation: flow-x 3s ease-in-out infinite;
}

.flow-node + .flow-edge .packet {
  animation-delay: 1.5s;
}

.flow-return {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 20px;
  margin-top: 20px;
}

.flow-return::before {
  content: "";
  position: absolute;
  top: 50%;
  right: 0;
  left: 0;
  border-top: 1px dashed var(--vp-c-divider);
}

.flow-return span {
  position: relative;
  padding: 0 10px;
  color: var(--vp-c-text-3);
  background: var(--vp-c-bg-soft);
  font-size: 12px;
}

.packet.back {
  top: 50%;
  left: 100%;
  animation: flow-back 3.2s ease-in-out infinite;
}

@keyframes flow-x {
  0% {
    opacity: 0;
    transform: translateX(-4px);
  }
  15%,
  85% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: translateX(64px);
  }
}

@keyframes flow-back {
  0% {
    left: 100%;
    opacity: 0;
  }
  15%,
  85% {
    opacity: 1;
  }
  100% {
    left: 0;
    opacity: 0;
  }
}

@media (max-width: 768px) {
  .flow {
    padding: 16px;
  }

  .flow-row {
    grid-template-columns: 1fr;
  }

  .flow-edge {
    width: 2px;
    height: 32px;
    margin: 0 auto;
  }

  .flow-edge::before {
    inset: 0;
    background: repeating-linear-gradient(180deg, var(--vp-c-divider) 0 5px, transparent 5px 10px);
  }

  .packet {
    top: 0;
    left: 50%;
    margin: -4px 0 0 -4px;
    animation-name: flow-y;
    animation-duration: 2.4s;
  }

  .flow-return {
    display: none;
  }

  @keyframes flow-y {
    0% {
      opacity: 0;
      transform: translateY(-4px);
    }
    20%,
    80% {
      opacity: 1;
    }
    100% {
      opacity: 0;
      transform: translateY(32px);
    }
  }
}

@media (prefers-reduced-motion: reduce) {
  .packet {
    animation: none;
    opacity: 0.55;
  }

  .packet.back {
    display: none;
  }
}
</style>

<template>
  <div class="chat-panel">
    <template v-if="props.controls">
      <div class="controls">
        <div class="circle red" />
        <div class="circle yellow" />
        <div class="circle green" />
        <div class="title">{{ props.title }}</div>
      </div>
    </template>
    <div class="content"><slot /></div>
  </div>
</template>

<script lang="ts" setup>
interface ChatPanelProps {
  controls?: boolean;
  title?: string;
}

const props = withDefaults(defineProps<ChatPanelProps>(), {
  controls: true,
  title: "聊天记录",
});
</script>

<style lang="scss">
.chat-panel {
  position: relative;
  border-radius: 0.5rem;
  margin: 1rem auto;
  padding: 0.3rem 0;
  background-color: #f9f9f9;
  overflow-x: auto;

  .controls {
    display: initial;
    width: 100%;
    padding: 0.5rem;

    .circle {
      display: inline-block;
      margin: 0.5rem 0rem 0.5rem 0.2rem;
      width: 0.8rem;
      height: 0.8rem;
      border-radius: 50%;

      &.red {
        background-color: #ff5f56;
      }

      &.yellow {
        background-color: #ffbd2e;
      }

      &.green {
        background-color: #27c93f;
      }
    }

    .title {
      position: absolute;
      text-align: center;
      width: 100%;
      font-size: 0.8rem;
      line-height: 1rem;
      top: 0.8rem;
    }
  }

  .content {
    padding: 0 1rem;
  }
}
</style>

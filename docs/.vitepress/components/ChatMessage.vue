<template>
  <div ref="messageEl" class="chat-message show" :class="{ show }">
    <chat-avatar
      :id="props.id"
      :avatar="props.avatar"
      :nickname="props.nickname"
      :color="props.color"
    ></chat-avatar>
    <div class="message-box">
      <div class="nickname">{{ props.nickname }}</div>
      <div class="message shadow-sm">
        <slot></slot>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, watch, onMounted } from "vue";
interface ChatMessageProps {
  avatar?: string;
  id?: number;
  nickname?: string;
  color?: string;
}

const props = defineProps<ChatMessageProps>();

const emit = defineEmits<{
  (e: "appear"): void;
}>();

const messageEl = ref<HTMLElement | null>();

const show = ref(false);
const active = ref(false);
const moving = ref(false);

// todo
// watch(active, (value)=> {
//   if (!value) return (show.value = false);
//   if (!messageEl.value) return
//   const prev =
//     messageEl.value.previousElementSibling
//   if (prev && (prev.moving || !prev.show)) {
//     prev.$once("appear", appear);
//   } else {
//     appear();
//   }
// })

const appear = () => {
  show.value = true;
  moving.value = true;
  setTimeout(() => {
    moving.value = false;
    emit("appear");
  }, 200);
};

const handleScroll = () => {
  if (!messageEl.value) return;
  const rect = messageEl.value.getBoundingClientRect();
  if (rect.top < innerHeight) active.value = true;
};

onMounted(() => {
  handleScroll();
  addEventListener("scroll", handleScroll);
});
</script>

<style lang="scss">
.chat-message {
  position: relative;
  margin: 1rem 0;
  opacity: 0;
  transform: translateX(-10%);
  transition: transform 0.4s ease-out, opacity 0.4s ease-in;

  &.show {
    opacity: 1;
    transform: translateX(0);
  }
}

.message-box {
  display: inline-block;
  margin-left: 0.5rem;
  max-width: 90%;
  vertical-align: top;
}

.nickname {
  font-size: 0.8rem;
  color: gray;
}

.message {
  position: relative;
  font-size: 0.9rem;
  border-radius: 0.5rem;
  background-color: var(--c-bg);
  word-break: break-all;
  padding: 0.6rem 0.7rem;
  margin-top: 0.2rem;

  > img {
    border-radius: 0.5rem;
    vertical-align: middle;
  }

  &::before {
    content: "";
    position: absolute;
    right: 100%;
    top: 0px;
    width: 8px;
    height: 8px;
    border: 0 solid transparent;
    border-bottom-width: 5px;
    border-bottom-color: currentColor;
    border-radius: 0 0 0 1rem;
    color: var(--c-bg);
  }
}
</style>

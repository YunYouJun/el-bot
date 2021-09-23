<template>
  <div style="display: inline-block">
    <img
      v-if="props.avatar || props.id"
      class="avatar"
      :src="props.avatar || getAvatarById(props.id, props.type, props.size)"
    />
    <div v-else class="avatar" :style="`background-color:${color}`">
      {{ props.nickname[0] }}
    </div>
  </div>
</template>

<script setup lang="ts">
interface ChatAvatarProps {
  avatar?: string;
  id?: number | null;
  type?: "qq" | string;
  size?: number;
  nickname?: string;
  color?: string;
}

const props = withDefaults(defineProps<ChatAvatarProps>(), {
  avatar: "",
  id: null,
  type: "qq",
  size: 100,
  nickname: "",
  color: "steelblue",
});

const getAvatarById = (id, type, size) => {
  let url = "https://cdn.jsdelivr.net/gh/YunYouJun/cdn/img/avatar/none.jpg";
  if (type === "qq") {
    url = `https://q1.qlogo.cn/g?b=qq&nk=${id}&s=${size}`;
  } else if (type === "group") {
    url = `https://p.qlogo.cn/gh/${id}/${id}/${size}`;
  }
  return url;
};
</script>

<style>
.avatar {
  display: inline-flex;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  line-height: 0;
  justify-content: center;
  align-items: center;
  color: white;
}
</style>

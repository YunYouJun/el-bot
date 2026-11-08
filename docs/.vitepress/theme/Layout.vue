<script setup lang="ts">
import DefaultTheme from 'vitepress/theme'
import HeroMascot from '../components/HeroMascot.vue'

const { Layout } = DefaultTheme
</script>

<template>
  <Layout>
    <template #home-hero-image>
      <HeroMascot />
    </template>
  </Layout>
</template>

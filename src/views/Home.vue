<script setup lang="ts">
import Header from '../components/Header.vue'
import LinkBar from '../components/LinkBar.vue'
import ToolGrid from '../components/ToolGrid.vue'
import ThemePanel from '../components/ThemePanel.vue'
</script>

<template>
  <div class="min-h-screen bg-bg px-4 pb-16">
    <div class="max-w-4xl mx-auto">
      <Header />
      <LinkBar />
      <ToolGrid />
    </div>
    <ThemePanel />
  </div>
</template>

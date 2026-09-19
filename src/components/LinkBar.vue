<script setup lang="ts">
import { links } from '../data/links'
</script>

<template>
  <section class="mb-12">
    <h2 class="text-lg font-semibold text-text mb-4 text-center">链接</h2>
    <div class="flex flex-wrap justify-center gap-3">
      <a
        v-for="link in links"
        :key="link.name"
        :href="link.url"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-bg-card border border-border text-text hover:border-primary hover:text-primary transition-colors duration-200 text-sm no-underline"
      >
        <span v-if="link.icon.startsWith('i-')" :class="link.icon" class="text-base"></span>
        <span v-else class="text-base">{{ link.icon }}</span>
        <span>{{ link.name }}</span>
      </a>
    </div>
  </section>
</template>

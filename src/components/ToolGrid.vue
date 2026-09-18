<script setup lang="ts">
import { useRouter } from 'vue-router'
import { tools } from '../tools/registry'

const router = useRouter()

function openTool(id: string) {
  router.push(`/tool/${id}`)
}
</script>

<template>
  <section>
    <h2 class="text-lg font-semibold text-text mb-4 text-center">工具</h2>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-3xl mx-auto">
      <button
        v-for="tool in tools"
        :key="tool.id"
        class="bg-bg-card border border-border rounded-xl p-5 text-left cursor-pointer hover:border-primary hover:shadow-md transition-all duration-200 group"
        @click="openTool(tool.id)"
      >
        <div class="text-2xl mb-2 group-hover:text-primary transition-colors duration-200">{{ tool.icon }}</div>
        <div class="font-semibold text-text mb-1">{{ tool.name }}</div>
        <div class="text-sm text-text-light">{{ tool.description }}</div>
      </button>
    </div>
  </section>
</template>

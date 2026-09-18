<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { useRouter } from 'vue-router'
import { tools } from '../tools/registry'

const props = defineProps<{ toolId: string }>()

const router = useRouter()

const tool = computed(() => tools.find(t => t.id === props.toolId))

const toolComponent = computed(() => {
  if (!tool.value) return null
  return defineAsyncComponent(tool.value.component)
})
</script>

<template>
  <div class="min-h-screen bg-bg">
    <nav class="sticky top-0 z-10 bg-bg/80 backdrop-blur border-b border-border">
      <div class="max-w-5xl mx-auto px-4 h-12 flex items-center gap-3">
        <button
          class="text-text-light hover:text-primary transition-colors text-sm cursor-pointer bg-transparent border-none"
          @click="router.push('/')"
        >
          ← 返回主页
        </button>
        <span class="text-border">|</span>
        <span class="font-semibold text-text">{{ tool?.name }}</span>
      </div>
    </nav>
    <main class="max-w-5xl mx-auto px-4 py-6">
      <component v-if="toolComponent" :is="toolComponent" />
      <div v-else class="text-center text-text-light py-20">工具不存在</div>
    </main>
  </div>
</template>

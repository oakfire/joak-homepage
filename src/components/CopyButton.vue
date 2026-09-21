<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  text: string
}>()

const copied = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null

async function copy() {
  if (!props.text) return
  try {
    await navigator.clipboard.writeText(props.text)
    copied.value = true
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { copied.value = false }, 2000)
  } catch {}
}
</script>

<template>
  <button
    class="group relative inline-flex items-center justify-center w-7 h-7 rounded-md bg-transparent border-none cursor-pointer text-text-light hover:bg-border transition-colors"
    @click="copy"
  >
    <span :class="copied ? 'i-lucide-check text-green-500' : 'i-lucide-copy'" class="w-4 h-4" />
    <span
      class="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded text-xs whitespace-nowrap bg-text text-bg opacity-0 pointer-events-none transition-opacity"
      :class="copied ? '' : 'group-hover:opacity-100'"
    >复制</span>
  </button>
</template>

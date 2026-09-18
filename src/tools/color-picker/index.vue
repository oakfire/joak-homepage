<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { theme } from '../../composables/useTheme'

const hex = ref(theme.primary)
const r = ref(224)
const g = ref(122)
const b = ref(95)

function hexToRgb(h: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h)
  if (result) {
    r.value = parseInt(result[1], 16)
    g.value = parseInt(result[2], 16)
    b.value = parseInt(result[3], 16)
  }
}

function rgbToHex() {
  hex.value = '#' + [r.value, g.value, b.value].map(v => {
    const h = Math.max(0, Math.min(255, Math.round(v))).toString(16)
    return h.length === 1 ? '0' + h : h
  }).join('')
}

watch(hex, (val) => {
  if (/^#[0-9a-fA-F]{6}$/.test(val)) {
    hexToRgb(val)
  }
})

watch([r, g, b], () => {
  rgbToHex()
})

const hsl = computed(() => {
  const rr = r.value / 255
  const gg = g.value / 255
  const bb = b.value / 255
  const max = Math.max(rr, gg, bb)
  const min = Math.min(rr, gg, bb)
  let h = 0, s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === rr) h = ((gg - bb) / d + (gg < bb ? 6 : 0)) / 6
    else if (max === gg) h = ((bb - rr) / d + 2) / 6
    else h = ((rr - gg) / d + 4) / 6
  }

  return `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`
})

const rgbStr = computed(() => `rgb(${r.value}, ${g.value}, ${b.value})`)

function onColorInput(e: Event) {
  hex.value = (e.target as HTMLInputElement).value
}

function copyText(text: string) {
  navigator.clipboard.writeText(text)
}
</script>

<template>
  <div class="max-w-xl">
    <div class="flex items-start gap-6 mb-6">
      <div class="flex-shrink-0">
        <input
          type="color"
          :value="hex"
          @input="onColorInput"
          class="w-24 h-24 border-none rounded-xl cursor-pointer"
        />
      </div>
      <div class="flex-1 space-y-3">
        <div class="flex items-center gap-3">
          <label class="text-sm text-text-light w-10">HEX</label>
          <input
            v-model="hex"
            class="flex-1 px-3 py-2 rounded-lg border border-border bg-bg-card text-text text-sm focus:outline-none focus:border-primary transition-colors"
          />
          <button class="text-xs text-primary cursor-pointer bg-transparent border-none" @click="copyText(hex)">复制</button>
        </div>
        <div class="flex items-center gap-3">
          <label class="text-sm text-text-light w-10">RGB</label>
          <input
            :value="rgbStr"
            readonly
            class="flex-1 px-3 py-2 rounded-lg border border-border bg-bg text-text text-sm"
          />
          <button class="text-xs text-primary cursor-pointer bg-transparent border-none" @click="copyText(rgbStr)">复制</button>
        </div>
        <div class="flex items-center gap-3">
          <label class="text-sm text-text-light w-10">HSL</label>
          <input
            :value="hsl"
            readonly
            class="flex-1 px-3 py-2 rounded-lg border border-border bg-bg text-text text-sm"
          />
          <button class="text-xs text-primary cursor-pointer bg-transparent border-none" @click="copyText(hsl)">复制</button>
        </div>
      </div>
    </div>

    <div class="flex gap-4">
      <div class="flex-1">
        <label class="block text-sm text-text-light mb-2">R ({{ r }})</label>
        <input type="range" v-model.number="r" min="0" max="255" class="w-full accent-primary" />
      </div>
      <div class="flex-1">
        <label class="block text-sm text-text-light mb-2">G ({{ g }})</label>
        <input type="range" v-model.number="g" min="0" max="255" class="w-full accent-primary" />
      </div>
      <div class="flex-1">
        <label class="block text-sm text-text-light mb-2">B ({{ b }})</label>
        <input type="range" v-model.number="b" min="0" max="255" class="w-full accent-primary" />
      </div>
    </div>

    <div class="mt-6 h-20 rounded-xl" :style="{ backgroundColor: hex }" />
  </div>
</template>

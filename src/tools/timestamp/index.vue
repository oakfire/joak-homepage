<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

const timestamp = ref(Math.floor(Date.now() / 1000).toString())
const dateStr = ref('')
const mode = ref<'toDate' | 'toTimestamp'>('toDate')
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  timer = setInterval(() => { now.value = Date.now() }, 1000)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})

const nowTimestamp = computed(() => Math.floor(now.value / 1000))
const nowDate = computed(() => formatDate(now.value))

function formatDate(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function convertToDate() {
  const ts = Number(timestamp.value)
  if (isNaN(ts)) return
  const ms = timestamp.value.length <= 10 ? ts * 1000 : ts
  dateStr.value = formatDate(ms)
}

function convertToTimestamp() {
  const d = new Date(dateStr.value)
  if (isNaN(d.getTime())) return
  timestamp.value = Math.floor(d.getTime() / 1000).toString()
}

function useCurrent() {
  timestamp.value = nowTimestamp.value.toString()
  convertToDate()
}

function copyText(text: string) {
  navigator.clipboard.writeText(text)
}
</script>

<template>
  <div class="max-w-xl">
    <div class="mb-6 p-4 rounded-xl bg-bg-card border border-border">
      <div class="text-sm text-text-light mb-1">当前时间</div>
      <div class="text-2xl font-mono text-text">{{ nowTimestamp }}</div>
      <div class="text-sm text-text-light mt-1">{{ nowDate }}</div>
    </div>

    <div class="flex gap-2 mb-4">
      <button
        class="px-4 py-2 rounded-lg text-sm border-none cursor-pointer transition-colors"
        :class="mode === 'toDate' ? 'bg-primary text-white' : 'bg-bg-card text-text border border-border'"
        @click="mode = 'toDate'"
      >时间戳 → 日期</button>
      <button
        class="px-4 py-2 rounded-lg text-sm border-none cursor-pointer transition-colors"
        :class="mode === 'toTimestamp' ? 'bg-primary text-white' : 'bg-bg-card text-text border border-border'"
        @click="mode = 'toTimestamp'"
      >日期 → 时间戳</button>
    </div>

    <div v-if="mode === 'toDate'" class="space-y-4">
      <div>
        <label class="block text-sm text-text-light mb-2">时间戳（秒或毫秒）</label>
        <div class="flex gap-2">
          <input
            v-model="timestamp"
            class="flex-1 px-3 py-2 rounded-lg border border-border bg-bg-card text-text text-sm font-mono focus:outline-none focus:border-primary transition-colors"
            placeholder="1700000000"
          />
          <button class="px-4 py-2 rounded-lg bg-secondary text-text text-sm border-none cursor-pointer hover:bg-secondary-light transition-colors" @click="convertToDate">转换</button>
          <button class="px-4 py-2 rounded-lg bg-bg-card text-text text-sm border border-border cursor-pointer hover:border-primary transition-colors" @click="useCurrent">当前</button>
        </div>
      </div>
      <div v-if="dateStr">
        <label class="block text-sm text-text-light mb-2">日期</label>
        <div class="flex items-center gap-2">
          <input :value="dateStr" readonly class="flex-1 px-3 py-2 rounded-lg border border-border bg-bg text-text text-sm font-mono" />
          <button class="text-xs text-primary cursor-pointer bg-transparent border-none" @click="copyText(dateStr)">复制</button>
        </div>
      </div>
    </div>

    <div v-else class="space-y-4">
      <div>
        <label class="block text-sm text-text-light mb-2">日期时间</label>
        <div class="flex gap-2">
          <input
            v-model="dateStr"
            type="datetime-local"
            class="flex-1 px-3 py-2 rounded-lg border border-border bg-bg-card text-text text-sm focus:outline-none focus:border-primary transition-colors"
          />
          <button class="px-4 py-2 rounded-lg bg-secondary text-text text-sm border-none cursor-pointer hover:bg-secondary-light transition-colors" @click="convertToTimestamp">转换</button>
        </div>
      </div>
      <div v-if="timestamp">
        <label class="block text-sm text-text-light mb-2">时间戳</label>
        <div class="flex items-center gap-2">
          <input :value="timestamp" readonly class="flex-1 px-3 py-2 rounded-lg border border-border bg-bg text-text text-sm font-mono" />
          <button class="text-xs text-primary cursor-pointer bg-transparent border-none" @click="copyText(timestamp)">复制</button>
        </div>
      </div>
    </div>
  </div>
</template>

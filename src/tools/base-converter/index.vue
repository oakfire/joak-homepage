<script setup lang="ts">
import { ref, computed } from 'vue'

const input = ref('')
const fromBase = ref(10)
const error = ref('')
const copied = ref('')

const bases = [2, 8, 10, 16]

function parseInput(value: string, base: number): bigint {
  const trimmed = value.trim()
  if (!trimmed) throw new Error('请输入数值')

  const prefixMap: Record<string, number> = {
    '0b': 2, '0B': 2,
    '0o': 8, '0O': 8,
    '0x': 16, '0X': 16,
  }

  let numStr = trimmed
  let actualBase = base

  for (const [pfx, b] of Object.entries(prefixMap)) {
    if (numStr.startsWith(pfx)) {
      numStr = numStr.slice(2)
      actualBase = b
      break
    }
  }

  const negative = numStr.startsWith('-')
  if (negative) numStr = numStr.slice(1)

  const digits = '0123456789ABCDEF'
  let result = 0n
  const bigBase = BigInt(actualBase)

  for (const ch of numStr.toUpperCase()) {
    const val = digits.indexOf(ch)
    if (val < 0 || val >= actualBase) {
      throw new Error(`无效的 ${actualBase} 进制字符: ${ch}`)
    }
    result = result * bigBase + BigInt(val)
  }

  return negative ? -result : result
}

function convert(num: bigint, base: number): string {
  const negative = num < 0n
  if (negative) num = -num

  const digits = '0123456789ABCDEF'
  const bigBase = BigInt(base)

  if (num === 0n) return '0'

  let result = ''
  while (num > 0n) {
    result = digits[Number(num % bigBase)] + result
    num /= bigBase
  }

  return negative ? '-' + result : result
}

const results = computed(() => {
  error.value = ''
  if (!input.value.trim()) return []

  try {
    const num = parseInput(input.value, fromBase.value)
    return bases.map(base => ({
      base,
      label: getBaseLabel(base),
      value: convert(num, base),
    }))
  } catch (e: any) {
    error.value = e.message
    return []
  }
})

function getBaseLabel(base: number): string {
  const labels: Record<number, string> = {
    2: '二进制 (BIN)',
    8: '八进制 (OCT)',
    10: '十进制 (DEC)',
    16: '十六进制 (HEX)',
  }
  return labels[base] || `${base} 进制`
}

async function copyValue(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    copied.value = value
    setTimeout(() => { copied.value = '' }, 1500)
  } catch {}
}

function clear() {
  input.value = ''
  error.value = ''
}
</script>

<template>
  <div>
    <div class="flex flex-wrap items-center gap-3 mb-4">
      <label class="text-sm text-text-light">输入进制</label>
      <div class="flex gap-1">
        <button
          v-for="b in bases"
          :key="b"
          class="px-3 py-1.5 rounded-lg text-sm border-none cursor-pointer transition-colors"
          :class="fromBase === b ? 'bg-primary text-white' : 'bg-bg-card text-text border border-border'"
          @click="fromBase = b"
        >{{ b === 64 ? '64' : b }}</button>
      </div>
      <button class="px-4 py-1.5 rounded-lg bg-bg-card text-text text-sm border border-border cursor-pointer hover:border-primary transition-colors" @click="clear">清空</button>
    </div>

    <div class="mb-4">
      <label class="block text-sm text-text-light mb-2">输入数值</label>
      <input
        v-model="input"
        class="w-full p-4 rounded-lg border border-border bg-bg-card text-text text-sm focus:outline-none focus:border-primary transition-colors font-mono"
        :placeholder="fromBase === 16 ? '例如: 0xFF 或 FF' : fromBase === 2 ? '例如: 0b1010 或 1010' : fromBase === 8 ? '例如: 0o77 或 77' : '输入数值'"
      />
    </div>

    <div v-if="error" class="mb-4 px-4 py-3 rounded-lg bg-red-50 text-red-600 text-sm border border-red-200">
      {{ error }}
    </div>

    <div v-if="results.length" class="space-y-3">
      <div
        v-for="r in results"
        :key="r.base"
        class="flex items-center gap-3 p-3 rounded-lg bg-bg-card border border-border"
      >
        <span class="text-sm text-text-light w-32 shrink-0">{{ r.label }}</span>
        <code class="flex-1 text-sm font-mono text-text break-all">{{ r.value }}</code>
        <button
          class="px-3 py-1 rounded text-xs border-none cursor-pointer transition-colors shrink-0"
          :class="copied === r.value ? 'bg-green-500 text-white' : 'bg-bg text-text-light border border-border hover:border-primary'"
          @click="copyValue(r.value)"
        >{{ copied === r.value ? '已复制' : '复制' }}</button>
      </div>
    </div>
  </div>
</template>

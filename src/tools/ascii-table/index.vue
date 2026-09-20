<script setup lang="ts">
import { ref, computed } from 'vue'

const search = ref('')
const copiedIndex = ref<number | null>(null)

const asciiData = computed(() => {
  const data = []
  for (let i = 0; i < 128; i++) {
    const char = i < 32 || i === 127 ? getControlCharName(i) : String.fromCharCode(i)
    const displayChar = i < 32 || i === 127 ? getControlCharSymbol(i) : String.fromCharCode(i)
    data.push({
      dec: i,
      hex: i.toString(16).toUpperCase().padStart(2, '0'),
      oct: i.toString(8).padStart(3, '0'),
      bin: i.toString(2).padStart(8, '0'),
      char: char,
      displayChar: displayChar,
      isPrintable: i >= 32 && i < 127,
      isControl: i < 32 || i === 127,
    })
  }
  return data
})

const filteredData = computed(() => {
  if (!search.value) return asciiData.value

  const query = search.value.toLowerCase()
  return asciiData.value.filter(item => {
    return (
      item.dec.toString().includes(query) ||
      item.hex.toLowerCase().includes(query) ||
      item.oct.includes(query) ||
      item.char.toLowerCase().includes(query) ||
      item.displayChar.toLowerCase().includes(query)
    )
  })
})

function getControlCharName(code: number): string {
  const names: Record<number, string> = {
    0: 'NUL',
    1: 'SOH',
    2: 'STX',
    3: 'ETX',
    4: 'EOT',
    5: 'ENQ',
    6: 'ACK',
    7: 'BEL',
    8: 'BS',
    9: 'HT',
    10: 'LF',
    11: 'VT',
    12: 'FF',
    13: 'CR',
    14: 'SO',
    15: 'SI',
    16: 'DLE',
    17: 'DC1',
    18: 'DC2',
    19: 'DC3',
    20: 'DC4',
    21: 'NAK',
    22: 'SYN',
    23: 'ETB',
    24: 'CAN',
    25: 'EM',
    26: 'SUB',
    27: 'ESC',
    28: 'FS',
    29: 'GS',
    30: 'RS',
    31: 'US',
    127: 'DEL',
  }
  return names[code] || ''
}

function getControlCharSymbol(code: number): string {
  if (code === 127) return '␡'
  if (code < 32) return String.fromCharCode(code + 0x2400)
  return ''
}

async function copyToClipboard(text: string, index: number) {
  try {
    await navigator.clipboard.writeText(text)
    copiedIndex.value = index
    setTimeout(() => {
      copiedIndex.value = null
    }, 1500)
  } catch (err) {
    console.error('Failed to copy:', err)
  }
}
</script>

<template>
  <div>
    <div class="mb-4">
      <input
        v-model="search"
        type="text"
        class="w-full max-w-md px-4 py-2 rounded-lg border border-border bg-bg-card text-text text-sm focus:outline-none focus:border-primary transition-colors"
        placeholder="搜索：输入十进制、十六进制或字符..."
      />
    </div>

    <div class="mb-4 text-sm text-text-light">
      显示 {{ filteredData.length }} / 128 个字符
      <span class="ml-4">
        <span class="inline-block w-3 h-3 rounded bg-primary mr-1"></span>可打印字符
        <span class="inline-block w-3 h-3 rounded bg-bg-card border border-border mr-1 ml-4"></span>控制字符
      </span>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div v-for="(group, groupIndex) in [filteredData.slice(0, 64), filteredData.slice(64)]" :key="groupIndex">
        <table class="w-full border-collapse">
          <thead>
            <tr class="bg-bg-card">
              <th class="px-2 py-1 text-left text-xs font-medium text-text-light border border-border">十进制</th>
              <th class="px-2 py-1 text-left text-xs font-medium text-text-light border border-border">十六进制</th>
              <th class="px-2 py-1 text-left text-xs font-medium text-text-light border border-border">字符</th>
              <th class="px-2 py-1 text-left text-xs font-medium text-text-light border border-border">显示</th>
              <th class="px-2 py-1 text-left text-xs font-medium text-text-light border border-border">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="item in group"
              :key="item.dec"
              class="hover:bg-bg-card transition-colors"
              :class="item.isPrintable ? 'bg-primary/5' : ''"
            >
              <td class="px-2 py-0.5 text-xs text-text border border-border font-mono">{{ item.dec }}</td>
              <td class="px-2 py-0.5 text-xs text-text border border-border font-mono">0x{{ item.hex }}</td>
              <td class="px-2 py-0.5 text-xs text-text border border-border font-mono">{{ item.char }}</td>
              <td class="px-2 py-0.5 text-xs text-text border border-border font-mono text-center">
                <span v-if="item.isPrintable" class="text-sm">{{ item.displayChar }}</span>
                <span v-else class="text-text-light text-base">{{ item.displayChar }}</span>
              </td>
              <td class="px-2 py-0.5 text-xs border border-border">
                <button
                  class="p-1 rounded bg-bg-card text-text border border-border hover:border-primary transition-colors"
                  :class="copiedIndex === item.dec ? 'bg-primary text-white' : ''"
                  @click="copyToClipboard(item.isPrintable ? item.displayChar : item.char, item.dec)"
                >
                  <span :class="copiedIndex === item.dec ? 'i-lucide-check' : 'i-lucide-copy'" class="w-3 h-3"></span>
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
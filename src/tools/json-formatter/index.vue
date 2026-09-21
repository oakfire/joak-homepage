<script setup lang="ts">
import { ref } from 'vue'
import CopyButton from '../../components/CopyButton.vue'

const input = ref('')
const output = ref('')
const error = ref('')
const indent = ref(2)

function format() {
  error.value = ''
  try {
    const parsed = JSON.parse(input.value)
    output.value = JSON.stringify(parsed, null, indent.value)
  } catch (e: any) {
    error.value = e.message
    output.value = ''
  }
}

function compress() {
  error.value = ''
  try {
    const parsed = JSON.parse(input.value)
    output.value = JSON.stringify(parsed)
  } catch (e: any) {
    error.value = e.message
    output.value = ''
  }
}


function clear() {
  input.value = ''
  output.value = ''
  error.value = ''
}
</script>

<template>
  <div>
    <div class="flex flex-wrap gap-2 mb-4">
      <button class="px-4 py-2 rounded-lg bg-primary text-white text-sm border-none cursor-pointer hover:bg-primary-light transition-colors" @click="format">格式化</button>
      <button class="px-4 py-2 rounded-lg bg-secondary text-text text-sm border-none cursor-pointer hover:bg-secondary-light transition-colors" @click="compress">压缩</button>
      <button class="px-4 py-2 rounded-lg bg-bg-card text-text text-sm border border-border cursor-pointer hover:border-primary transition-colors" @click="clear">清空</button>
      <div class="flex items-center gap-2 ml-auto text-sm text-text-light">
        <label>缩进</label>
        <select v-model.number="indent" class="border border-border rounded px-2 py-1 bg-bg-card text-text text-sm">
          <option :value="2">2</option>
          <option :value="4">4</option>
          <option :value="0">无</option>
        </select>
      </div>
    </div>

    <div v-if="error" class="mb-4 px-4 py-3 rounded-lg bg-red-50 text-red-600 text-sm border border-red-200">
      {{ error }}
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div>
        <div class="flex items-center h-7 mb-2">
          <label class="text-sm text-text-light">输入</label>
        </div>
        <textarea
          v-model="input"
          class="w-full h-80 p-4 rounded-lg border border-border bg-bg-card text-text text-sm resize-y focus:outline-none focus:border-primary transition-colors"
          placeholder='粘贴 JSON，例如 {"key": "value"}'
        />
      </div>
      <div>
        <div class="flex items-center justify-between mb-2">
          <label class="text-sm text-text-light">输出</label>
          <CopyButton :text="output" />
        </div>
        <textarea
          :value="output"
          readonly
          class="w-full h-80 p-4 rounded-lg border border-border bg-bg text-text text-sm resize-y focus:outline-none"
          placeholder="格式化结果"
        />
      </div>
    </div>
  </div>
</template>

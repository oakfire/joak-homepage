<script setup lang="ts">
import { ref } from 'vue'
import CopyButton from '../../components/CopyButton.vue'

const input = ref('')
const output = ref('')
const error = ref('')
const mode = ref<'encode' | 'decode'>('encode')

function process() {
  error.value = ''
  try {
    if (mode.value === 'encode') {
      output.value = btoa(unescape(encodeURIComponent(input.value)))
    } else {
      output.value = decodeURIComponent(escape(atob(input.value)))
    }
  } catch (e: any) {
    error.value = e.message
    output.value = ''
  }
}

function swap() {
  const tmp = input.value
  input.value = output.value
  output.value = tmp
  mode.value = mode.value === 'encode' ? 'decode' : 'encode'
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
      <button
        class="px-4 py-2 rounded-lg text-sm border-none cursor-pointer transition-colors"
        :class="mode === 'encode' ? 'bg-primary text-white' : 'bg-bg-card text-text border border-border'"
        @click="mode = 'encode'"
      >编码</button>
      <button
        class="px-4 py-2 rounded-lg text-sm border-none cursor-pointer transition-colors"
        :class="mode === 'decode' ? 'bg-primary text-white' : 'bg-bg-card text-text border border-border'"
        @click="mode = 'decode'"
      >解码</button>
      <button class="px-4 py-2 rounded-lg bg-secondary text-text text-sm border-none cursor-pointer hover:bg-secondary-light transition-colors" @click="process">执行</button>
      <button class="px-4 py-2 rounded-lg bg-bg-card text-text text-sm border border-border cursor-pointer hover:border-primary transition-colors" @click="swap">交换</button>
      <button class="px-4 py-2 rounded-lg bg-bg-card text-text text-sm border border-border cursor-pointer hover:border-primary transition-colors" @click="clear">清空</button>
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
          class="w-full h-64 p-4 rounded-lg border border-border bg-bg-card text-text text-sm resize-y focus:outline-none focus:border-primary transition-colors"
          placeholder="输入要编码或解码的文本"
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
          class="w-full h-64 p-4 rounded-lg border border-border bg-bg text-text text-sm resize-y focus:outline-none"
          placeholder="结果"
        />
      </div>
    </div>
  </div>
</template>

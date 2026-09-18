<script setup lang="ts">
import { ref, computed } from 'vue'

const pattern = ref('')
const flags = ref('g')
const testText = ref('Hello World 123, hello world 456.')
const error = ref('')

const matches = computed(() => {
  if (!pattern.value || !testText.value) return []
  try {
    const regex = new RegExp(pattern.value, flags.value)
    const results: { text: string; index: number; groups?: Record<string, string> }[] = []
    let match: RegExpExecArray | null
    if (flags.value.includes('g')) {
      while ((match = regex.exec(testText.value)) !== null) {
        results.push({ text: match[0], index: match.index, groups: match.groups ? { ...match.groups } : undefined })
        if (!match[0]) break
      }
    } else {
      match = regex.exec(testText.value)
      if (match) {
        results.push({ text: match[0], index: match.index, groups: match.groups ? { ...match.groups } : undefined })
      }
    }
    error.value = ''
    return results
  } catch (e: any) {
    error.value = e.message
    return []
  }
})

const highlightedText = computed(() => {
  if (!pattern.value || !testText.value || error.value) return ''
  try {
    const regex = new RegExp(pattern.value, flags.value.includes('g') ? flags.value : flags.value + 'g')
    return testText.value.replace(regex, '<mark class="bg-secondary/60 rounded px-0.5">$&</mark>')
  } catch {
    return ''
  }
})

function toggleFlag(f: string) {
  if (flags.value.includes(f)) {
    flags.value = flags.value.replace(f, '')
  } else {
    flags.value += f
  }
}

const presetPatterns = [
  { name: '邮箱', pattern: '[\\w.-]+@[\\w.-]+\\.[a-zA-Z]{2,}' },
  { name: '手机号', pattern: '1[3-9]\\d{9}' },
  { name: 'URL', pattern: 'https?://[\\w.-]+(?:/[\\w./-]*)?' },
  { name: 'IP 地址', pattern: '\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}' },
]
</script>

<template>
  <div>
    <div class="flex flex-wrap gap-2 mb-4">
      <div class="flex-1 min-w-48 flex items-center gap-2">
        <span class="text-text-light text-sm">/</span>
        <input
          v-model="pattern"
          class="flex-1 px-3 py-2 rounded-lg border border-border bg-bg-card text-text text-sm focus:outline-none focus:border-primary transition-colors"
          placeholder="输入正则表达式"
        />
        <span class="text-text-light text-sm">/</span>
        <div class="flex gap-1">
          <button
            v-for="f in ['g', 'i', 'm', 's']"
            :key="f"
            class="w-7 h-7 rounded text-xs font-mono cursor-pointer border transition-colors"
            :class="flags.includes(f) ? 'bg-primary text-white border-primary' : 'bg-bg-card text-text-light border-border'"
            @click="toggleFlag(f)"
          >{{ f }}</button>
        </div>
      </div>
    </div>

    <div class="flex flex-wrap gap-2 mb-4">
      <button
        v-for="p in presetPatterns"
        :key="p.name"
        class="px-3 py-1 rounded-full text-xs bg-bg-card border border-border text-text-light cursor-pointer hover:border-primary hover:text-primary transition-colors"
        @click="pattern = p.pattern"
      >{{ p.name }}</button>
    </div>

    <div v-if="error" class="mb-4 px-4 py-3 rounded-lg bg-red-50 text-red-600 text-sm border border-red-200">
      {{ error }}
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div>
        <label class="block text-sm text-text-light mb-2">测试文本</label>
        <textarea
          v-model="testText"
          class="w-full h-48 p-4 rounded-lg border border-border bg-bg-card text-text text-sm resize-y focus:outline-none focus:border-primary transition-colors"
          placeholder="输入要测试的文本"
        />
      </div>
      <div>
        <label class="block text-sm text-text-light mb-2">匹配高亮</label>
        <div
          class="w-full h-48 p-4 rounded-lg border border-border bg-bg text-text text-sm overflow-auto whitespace-pre-wrap"
          v-html="highlightedText || '<span class=\'text-text-light\'>匹配结果</span>'"
        />
      </div>
    </div>

    <div class="mt-4">
      <label class="block text-sm text-text-light mb-2">匹配结果 ({{ matches.length }})</label>
      <div class="max-h-48 overflow-auto rounded-lg border border-border">
        <table v-if="matches.length" class="w-full text-sm">
          <thead>
            <tr class="bg-bg text-text-light text-left">
              <th class="px-3 py-2 font-medium">#</th>
              <th class="px-3 py-2 font-medium">匹配</th>
              <th class="px-3 py-2 font-medium">位置</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(m, i) in matches" :key="i" class="border-t border-border">
              <td class="px-3 py-2 text-text-light">{{ i + 1 }}</td>
              <td class="px-3 py-2 font-mono text-primary">{{ m.text }}</td>
              <td class="px-3 py-2 text-text-light">{{ m.index }}</td>
            </tr>
          </tbody>
        </table>
        <div v-else class="px-4 py-8 text-center text-text-light text-sm">无匹配</div>
      </div>
    </div>
  </div>
</template>

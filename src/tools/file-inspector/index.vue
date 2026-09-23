<script setup lang="ts">
import { ref, computed } from 'vue'
import CopyButton from '../../components/CopyButton.vue'
import { inspectFile, type FileReport } from './parse'

const file = ref<File | null>(null)
const isDragging = ref(false)
const isInspecting = ref(false)
const report = ref<FileReport | null>(null)
const error = ref('')

const fileSize = computed(() => {
  if (!file.value) return ''
  return file.value.size.toLocaleString() + ' B'
})

const categoryLabel = computed(() => {
  const map: Record<string, string> = {
    executable: '可执行文件',
    library: '库 / 动态链接库',
    object: '目标文件',
    image: '图片',
    archive: '压缩 / 归档',
    document: '文档',
    media: '多媒体',
    script: '脚本',
    text: '文本',
    data: '数据',
    empty: '空文件',
  }
  return report.value ? (map[report.value.category] ?? report.value.category) : ''
})

function handleDrop(e: DragEvent) {
  e.preventDefault()
  isDragging.value = false
  const files = e.dataTransfer?.files
  if (files?.length) selectFile(files[0])
}

function handleDragOver(e: DragEvent) {
  e.preventDefault()
  isDragging.value = true
}

function handleDragLeave() {
  isDragging.value = false
}

function handleFileInput(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files?.length) selectFile(input.files[0])
}

async function selectFile(f: File) {
  file.value = f
  report.value = null
  error.value = ''
  isInspecting.value = true
  try {
    report.value = await inspectFile(f)
  } catch (e: any) {
    error.value = e.message || '检测失败'
  } finally {
    isInspecting.value = false
  }
}

function reset() {
  file.value = null
  report.value = null
  error.value = ''
}
</script>

<template>
  <div class="max-w-2xl">
    <div
      class="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors mb-6"
      :class="isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'"
      @drop="handleDrop"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @click="($refs.fileInput as HTMLInputElement).click()"
    >
      <div v-if="!file" class="text-text-light">
        <div class="text-4xl mb-3">🔍</div>
        <div class="text-lg font-medium mb-1">拖拽文件到此处或点击选择</div>
        <div class="text-sm">检测文件类型与运行平台架构</div>
      </div>
      <div v-else class="text-left">
        <div class="flex items-center gap-3 mb-2">
          <span class="text-2xl">📄</span>
          <div class="flex-1 min-w-0">
            <div class="text-text font-medium truncate">{{ file.name }}</div>
            <div class="text-sm text-text-light">{{ fileSize }}</div>
          </div>
          <button
            class="px-3 py-1 rounded bg-bg-card text-text text-sm border border-border cursor-pointer hover:border-primary transition-colors"
            @click.stop="reset"
          >更换文件</button>
        </div>
      </div>
      <input ref="fileInput" type="file" class="hidden" @change="handleFileInput" />
    </div>

    <div v-if="isInspecting" class="mb-6 text-sm text-text-light">检测中...</div>

    <div v-if="error" class="mb-6 px-4 py-3 rounded-lg bg-red-50 text-red-600 text-sm border border-red-200">
      {{ error }}
    </div>

    <div v-if="report">
      <div class="mb-4 p-4 rounded-xl bg-bg-card border border-border">
        <div class="flex items-start justify-between gap-3 mb-3">
          <div class="text-sm text-text-light font-medium">检测结果（file 描述）</div>
          <CopyButton :text="report.summary" />
        </div>
        <code class="block font-mono text-sm text-text break-all select-all leading-relaxed">{{ report.summary }}</code>
      </div>

      <div class="mb-4 p-4 rounded-xl bg-bg-card border border-border">
        <div class="text-sm text-text-light mb-3 font-medium">概览</div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <div class="text-xs text-text-light">类型</div>
            <div class="text-lg font-semibold text-text">{{ report.format }}</div>
          </div>
          <div>
            <div class="text-xs text-text-light">分类</div>
            <div class="text-lg font-semibold text-text">{{ categoryLabel }}</div>
          </div>
          <div>
            <div class="text-xs text-text-light">运行平台</div>
            <div class="text-lg font-semibold text-text">{{ report.platform ?? '—' }}</div>
          </div>
          <div>
            <div class="text-xs text-text-light">MIME</div>
            <div class="text-sm font-mono text-text break-all">{{ report.mime }}</div>
          </div>
        </div>
      </div>

      <div class="rounded-xl border border-border overflow-hidden">
        <div class="bg-bg px-4 py-2 text-sm font-medium text-text-light border-b border-border">详细字段</div>
        <div
          v-for="field in report.fields"
          :key="field.label"
          class="flex items-start px-4 py-2 border-b border-border/50 last:border-b-0 hover:bg-bg/50 transition-colors"
        >
          <span class="text-sm text-text-light w-52 flex-shrink-0 font-mono">{{ field.label }}</span>
          <span class="text-sm text-text font-mono flex-1 break-all">
            {{ typeof field.value === 'boolean' ? (field.value ? '1 (true)' : '0 (false)') : field.value }}
          </span>
          <span v-if="field.note" class="text-xs text-text-light ml-2 shrink-0">{{ field.note }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

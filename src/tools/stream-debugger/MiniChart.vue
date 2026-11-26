<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'

const props = withDefaults(defineProps<{
  label: string
  color: string
  data: number[]
  unit?: string
  fixedMax?: number
  formatValue?: (v: number) => string
}>(), {
  unit: '',
  fixedMax: 0,
  formatValue: undefined,
})

const canvasRef = ref<HTMLCanvasElement | null>(null)
let ro: ResizeObserver | null = null

function draw() {
  const canvas = canvasRef.value
  if (!canvas) return
  const parent = canvas.parentElement
  if (!parent) return
  const dpr = window.devicePixelRatio || 1
  const w = parent.clientWidth
  const h = parent.clientHeight
  if (w === 0 || h === 0) return
  canvas.width = w * dpr
  canvas.height = h * dpr
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  const pad = 4
  const vals = props.data
  let max = props.fixedMax > 0 ? props.fixedMax : Math.max(1, ...vals) * 1.2
  if (!isFinite(max) || max <= 0) max = 1

  // 网格线
  ctx.strokeStyle = 'rgba(128,128,128,0.2)'
  ctx.lineWidth = 1
  for (let i = 1; i < 4; i++) {
    const y = pad + ((h - pad * 2) * i) / 4
    ctx.beginPath()
    ctx.moveTo(pad, y)
    ctx.lineTo(w - pad, y)
    ctx.stroke()
  }

  if (vals.length < 2) return

  // 曲线
  const dx = (w - pad * 2) / (vals.length - 1)
  ctx.beginPath()
  ctx.lineWidth = 1.5
  ctx.strokeStyle = props.color
  vals.forEach((v, i) => {
    const x = pad + i * dx
    const ratio = Math.min(1, Math.max(0, (isFinite(v) ? v : 0) / max))
    const y = h - pad - ratio * (h - pad * 2)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  })
  ctx.stroke()

  // 填充
  ctx.lineTo(pad + (vals.length - 1) * dx, h - pad)
  ctx.lineTo(pad, h - pad)
  ctx.closePath()
  ctx.fillStyle = `${props.color}22`
  ctx.fill()
}

watch(() => props.data, () => draw(), { deep: true })

onMounted(() => {
  draw()
  ro = new ResizeObserver(() => draw())
  if (canvasRef.value?.parentElement) ro.observe(canvasRef.value.parentElement)
})

onBeforeUnmount(() => {
  ro?.disconnect()
})
</script>

<template>
  <div class="rounded-xl border border-border bg-bg-card p-3">
    <div class="flex items-baseline justify-between mb-1">
      <span class="text-xs text-text-light">{{ label }}</span>
      <span class="text-sm font-semibold font-mono" :style="{ color }">
        {{ data.length ? (formatValue ? formatValue(data[data.length - 1]) : data[data.length - 1].toFixed(1)) : '-' }}<template v-if="unit && !formatValue"> {{ unit }}</template>
      </span>
    </div>
    <div class="relative w-full h-16">
      <canvas ref="canvasRef" class="absolute inset-0" />
    </div>
  </div>
</template>

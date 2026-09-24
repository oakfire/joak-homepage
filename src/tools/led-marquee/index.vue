<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'

const mode = ref<'marquee' | 'warning' | 'screensaver'>('marquee')

const text = ref('注意安全 · LED 跑马灯 Hello!')
const fontSize = ref(48)
const maxFont = ref(480)
const speed = ref(5)
const textColor = ref('#FF3B30')
const bgColor = ref('#000000')
const dirMode = ref<'auto' | 'h' | 'v'>('auto')
const rotDeg = ref<0 | 90 | -90>(0)
const vScroll = ref<'up' | 'down'>('up')
const playing = ref(true)
const ledDots = ref(true)
const glow = ref(true)

const warnA = ref('#FF0000')
const warnB = ref('#0026FF')
const warnSpeed = ref(5)
const warnPattern = ref<'split' | 'full'>('full')
const warnRunning = ref(false)
const warnPhase = ref(false)
const warnEl = ref<HTMLElement | null>(null)

const isNarrow = ref(false)
const isPortrait = ref(false)
const boxH = ref(300)

const matrixCanvas = ref<HTMLCanvasElement | null>(null)
const matrixColor = ref('#00FF41')
const matrixBg = ref('#000000')
const matrixSpeed = ref(3)
const matrixSize = ref(24)
const matrixFps = ref(15)
const matrixCharset = ref<'kana' | 'binary' | 'digit' | 'latin' | 'han'>('kana')
const matrixPlaying = ref(true)

const CHARSET_MAP: Record<string, string> = {
  kana: 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789',
  binary: '01',
  digit: '0123456789',
  latin: 'ABCDEF0123456789',
  han: '零壹贰叁肆伍陆柒捌玖屏保矩阵',
}

const RENDER_SCALE = 0.65

let mCtx: CanvasRenderingContext2D | null = null
let mDrops: number[] = []
let mCols = 0
let mFontPx = 12
let mLast = 0
let mRaf = 0
let mRO: ResizeObserver | null = null

function parseHex(hex: string): [number, number, number] {
  let h = (hex || '#000000').replace('#', '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0]
}

function brighten(hex: string, t: number) {
  const [r, g, b] = parseHex(hex)
  const mix = (v: number) => Math.round(v + (255 - v) * t)
  return `#${[mix(r), mix(g), mix(b)].map(v => v.toString(16).padStart(2, '0')).join('')}`
}

function updateViewport() {
  isNarrow.value = window.matchMedia('(max-width: 768px)').matches
  isPortrait.value = window.matchMedia('(orientation: portrait)').matches
  maxFont.value = Math.max(320, Math.round(window.innerHeight * 1.3))
  if (fontSize.value > maxFont.value) fontSize.value = maxFont.value
}

function syncBox() {
  const el = warnEl.value
  if (!el) return
  boxH.value = el.clientHeight || 300
}

function sizeMatrix() {
  const el = warnEl.value
  const cv = matrixCanvas.value
  if (!el || !cv) return
  const w = el.clientWidth
  const h = el.clientHeight
  if (!w || !h) return
  const cw = Math.max(1, Math.floor(w * RENDER_SCALE))
  const ch = Math.max(1, Math.floor(h * RENDER_SCALE))
  if (cv.width !== cw || cv.height !== ch) {
    cv.width = cw
    cv.height = ch
    cv.style.width = w + 'px'
    cv.style.height = h + 'px'
  }
  mFontPx = Math.max(8, Math.round(matrixSize.value * RENDER_SCALE))
  mCols = Math.ceil(cw / mFontPx)
  mDrops = Array.from({ length: mCols }, () => Math.random() * -30)
  mCtx = cv.getContext('2d', { alpha: false })
  if (mCtx) {
    mCtx.fillStyle = matrixBg.value
    mCtx.fillRect(0, 0, cw, ch)
  }
}

function drawMatrix(ts: number) {
  mRaf = requestAnimationFrame(drawMatrix)
  if (!mCtx || !matrixPlaying.value) return
  const interval = 1000 / matrixFps.value
  if (ts - mLast < interval) return
  mLast = ts

  const ctx = mCtx
  const cw = ctx.canvas.width
  const ch = ctx.canvas.height
  const [br, bgc, bb] = parseHex(matrixBg.value)

  ctx.fillStyle = `rgba(${br},${bgc},${bb},0.14)`
  ctx.fillRect(0, 0, cw, ch)

  const chars = CHARSET_MAP[matrixCharset.value]
  const step = 0.35 + matrixSpeed.value * 0.2
  const head = brighten(matrixColor.value, 0.7)

  ctx.font = `${mFontPx}px monospace`
  ctx.textBaseline = 'top'

  for (let i = 0; i < mCols; i++) {
    const y = mDrops[i] * mFontPx
    const chx = i * mFontPx
    ctx.fillStyle = matrixColor.value
    ctx.fillText(chars[(Math.random() * chars.length) | 0], chx, y)
    if (Math.random() > 0.9) {
      ctx.fillStyle = head
      ctx.fillText(chars[(Math.random() * chars.length) | 0], chx, y)
    }
    if (y > ch && Math.random() > 0.97) {
      mDrops[i] = -Math.random() * 20 - 1
    }
    mDrops[i] += step
  }
}

function startMatrix() {
  stopMatrix()
  sizeMatrix()
  mLast = 0
  mRaf = requestAnimationFrame(drawMatrix)
}

function stopMatrix() {
  if (mRaf) cancelAnimationFrame(mRaf)
  mRaf = 0
}

function onVisibility() {
  if (document.hidden) stopMatrix()
  else if (mode.value === 'screensaver') startMatrix()
}

onMounted(() => {
  updateViewport()
  window.addEventListener('resize', updateViewport)
  window.addEventListener('orientationchange', updateViewport)
  document.addEventListener('fullscreenchange', onFsChange)
  document.addEventListener('visibilitychange', onVisibility)
  mRO = new ResizeObserver(() => {
    syncBox()
    if (mode.value === 'screensaver') sizeMatrix()
  })
  if (warnEl.value) {
    mRO.observe(warnEl.value)
    syncBox()
  }
})
onUnmounted(() => {
  window.removeEventListener('resize', updateViewport)
  window.removeEventListener('orientationchange', updateViewport)
  document.removeEventListener('fullscreenchange', onFsChange)
  document.removeEventListener('visibilitychange', onVisibility)
  stopWarnTimer()
  stopMatrix()
  mRO?.disconnect()
})

const autoDir = computed<'h' | 'v'>(() => (isPortrait.value || isNarrow.value) ? 'v' : 'h')
const actualDir = computed(() => dirMode.value === 'auto' ? autoDir.value : dirMode.value)

const chars = computed(() => {
  const raw = text.value || ' '
  return Array.from(raw).map(c => (c === ' ' ? '\u00A0' : c))
})

const displayText = computed(() => text.value || ' ')

const previewH = computed(() => {
  if (mode.value === 'marquee' && actualDir.value === 'h' && rotDeg.value === 0) {
    return Math.min(Math.max(72, Math.round(fontSize.value * 2.2)), Math.round(maxFont.value * 0.55))
  }
  return 300
})

function fillScreenFont() {
  const h = document.fullscreenElement ? window.innerHeight : (boxH.value || window.innerHeight)
  fontSize.value = Math.min(maxFont.value, Math.round(h * 1.15))
}

const pxPerSec = computed(() => 20 + (speed.value - 1) * 40)

const copyLen = computed(() => {
  if (actualDir.value === 'h') {
    return Math.max(chars.value.length * fontSize.value * 0.9, 120)
  }
  return Math.max(chars.value.length * fontSize.value * 1.2, 120)
})

const animDuration = computed(() => +(copyLen.value / pxPerSec.value).toFixed(2))

const textStyle = computed(() => ({
  fontSize: fontSize.value + 'px',
  color: textColor.value,
  lineHeight: '1.15',
  textShadow: glow.value ? `0 0 ${Math.round(fontSize.value / 4)}px ${textColor.value}` : 'none',
}))

const hTrackStyle = computed(() => ({
  ...textStyle.value,
  animation: `led-x ${animDuration.value}s linear infinite`,
  animationPlayState: playing.value ? 'running' : 'paused',
}))

const bandH = computed(() => Math.max(48, Math.round(fontSize.value * 2)))

const rotBoxStyle = computed(() => ({
  width: boxH.value + 'px',
  height: bandH.value + 'px',
  transform: `translate(-50%, -50%) rotate(${rotDeg.value}deg)`,
}))

const vTrackStyle = computed(() => ({
  ...textStyle.value,
  animation: `led-y-${vScroll.value} ${animDuration.value}s linear infinite`,
  animationPlayState: playing.value ? 'running' : 'paused',
}))

const warnIntervalMs = computed(() => 1100 - (warnSpeed.value - 1) * 100)

let warnTimer: ReturnType<typeof setInterval> | null = null

function stopWarnTimer() {
  if (warnTimer) {
    clearInterval(warnTimer)
    warnTimer = null
  }
}

function startWarnTimer() {
  stopWarnTimer()
  warnPhase.value = false
  warnTimer = setInterval(() => {
    warnPhase.value = !warnPhase.value
  }, warnIntervalMs.value)
}

watch(warnIntervalMs, () => {
  if (warnRunning.value) startWarnTimer()
})

watch(mode, (m) => {
  stopWarnTimer()
  warnRunning.value = false
  if (m === 'screensaver') nextTick(() => startMatrix())
  else stopMatrix()
})

watch(matrixSize, () => {
  if (mode.value === 'screensaver') sizeMatrix()
})

function toggleWarn() {
  if (warnRunning.value) {
    warnRunning.value = false
    stopWarnTimer()
  } else {
    warnRunning.value = true
    startWarnTimer()
  }
}

function applyPreset(a: string, b: string) {
  warnA.value = a
  warnB.value = b
  warnRunning.value = true
  startWarnTimer()
}

function onFsChange() {
  if (!document.fullscreenElement && mode.value === 'warning' && warnRunning.value) {
    warnRunning.value = false
    stopWarnTimer()
  }
}

async function toggleFullscreen() {
  const el = warnEl.value
  if (!el) return
  if (!document.fullscreenElement) {
    await el.requestFullscreen()
    if (mode.value === 'warning') {
      warnRunning.value = true
      startWarnTimer()
    }
  } else {
    await document.exitFullscreen()
  }
}

</script>

<template>
  <div class="max-w-2xl">
    <div class="flex gap-2 mb-4">
      <button
        class="px-4 py-2 rounded-lg text-sm border-none cursor-pointer transition-colors"
        :class="mode === 'marquee' ? 'bg-primary text-white' : 'bg-bg-card text-text border border-border'"
        @click="mode = 'marquee'"
      >跑马灯</button>
      <button
        class="px-4 py-2 rounded-lg text-sm border-none cursor-pointer transition-colors"
        :class="mode === 'warning' ? 'bg-primary text-white' : 'bg-bg-card text-text border border-border'"
        @click="mode = 'warning'"
      >警示灯</button>
      <button
        class="px-4 py-2 rounded-lg text-sm border-none cursor-pointer transition-colors"
        :class="mode === 'screensaver' ? 'bg-primary text-white' : 'bg-bg-card text-text border border-border'"
        @click="mode = 'screensaver'"
      >屏保</button>
    </div>

    <div
      ref="warnEl"
      class="led-fullscreen-host relative w-full overflow-hidden rounded-xl border border-border select-none cursor-pointer"
      :style="{ height: previewH + 'px', background: mode === 'marquee' ? bgColor : mode === 'screensaver' ? matrixBg : '#000' }"
      @dblclick="toggleFullscreen"
    >
      <template v-if="mode === 'marquee'">
        <div v-if="ledDots" class="absolute inset-0 led-grid pointer-events-none" />

        <div v-if="actualDir === 'h' && rotDeg === 0" class="h-full flex items-center overflow-hidden">
          <div class="marquee-h flex w-max whitespace-nowrap" :style="hTrackStyle">
            <span v-for="i in 2" :key="i" class="pr-16">{{ displayText }}</span>
          </div>
        </div>

        <div v-else-if="actualDir === 'h'" class="absolute inset-0 overflow-hidden">
          <div class="absolute left-1/2 top-1/2 overflow-hidden" :style="rotBoxStyle">
            <div class="h-full flex items-center">
              <div class="marquee-h flex w-max whitespace-nowrap" :style="hTrackStyle">
                <span v-for="i in 2" :key="i" class="pr-16">{{ displayText }}</span>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="h-full w-full flex justify-center overflow-hidden">
          <div class="marquee-v flex flex-col self-start" :style="vTrackStyle">
            <div v-for="i in 2" :key="i" class="flex flex-col items-center pb-12">
              <span v-for="(ch, j) in chars" :key="j">{{ ch }}</span>
            </div>
          </div>
        </div>
      </template>

      <template v-else-if="mode === 'screensaver'">
        <canvas ref="matrixCanvas" class="absolute inset-0 block" />
      </template>

      <template v-else>
        <div
          v-if="warnPattern === 'full'"
          class="absolute inset-0 transition-colors duration-75"
          :style="{ background: warnRunning ? (warnPhase ? warnA : warnB) : '#111' }"
        />
        <div
          v-else
          class="absolute inset-0 flex"
          :class="isPortrait || isNarrow ? 'flex-col' : 'flex-row'"
        >
          <div
            class="flex-1 transition-colors duration-75"
            :style="{ background: warnRunning ? (warnPhase ? warnA : warnB) : '#111' }"
          />
          <div
            class="flex-1 transition-colors duration-75"
            :style="{ background: warnRunning ? (warnPhase ? warnB : warnA) : '#111' }"
          />
        </div>
        <div
          v-if="!warnRunning"
          class="absolute inset-0 flex items-center justify-center text-text-light text-sm pointer-events-none"
        >
          点击「开始闪烁」或预设按钮启动警示灯
        </div>
      </template>
    </div>

    <div v-if="mode === 'marquee'" class="mt-4 space-y-4">
      <div>
        <label class="block text-sm text-text-light mb-2">文字</label>
        <input
          v-model="text"
          class="w-full px-3 py-2 rounded-lg border border-border bg-bg-card text-text text-sm focus:outline-none focus:border-primary transition-colors"
          placeholder="输入要滚动的文字"
        />
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <span class="text-sm text-text-light">文字方向</span>
        <button
          class="px-3 py-1.5 rounded-lg text-sm border-none cursor-pointer transition-colors"
          :class="dirMode === 'auto' ? 'bg-primary text-white' : 'bg-bg-card text-text border border-border'"
          @click="dirMode = 'auto'"
        >自动</button>
        <button
          class="px-3 py-1.5 rounded-lg text-sm border-none cursor-pointer transition-colors"
          :class="dirMode === 'h' ? 'bg-primary text-white' : 'bg-bg-card text-text border border-border'"
          @click="dirMode = 'h'"
        >横向</button>
        <button
          class="px-3 py-1.5 rounded-lg text-sm border-none cursor-pointer transition-colors"
          :class="dirMode === 'v' ? 'bg-primary text-white' : 'bg-bg-card text-text border border-border'"
          @click="dirMode = 'v'"
        >纵向</button>
        <template v-if="actualDir === 'h'">
          <button
            class="px-3 py-1.5 rounded-lg text-sm border-none cursor-pointer transition-colors"
            :class="rotDeg === 0 ? 'bg-primary text-white' : 'bg-bg-card text-text border border-border'"
            @click="rotDeg = 0"
          >不旋转</button>
          <button
            class="px-3 py-1.5 rounded-lg text-sm border-none cursor-pointer transition-colors"
            :class="rotDeg === 90 ? 'bg-primary text-white' : 'bg-bg-card text-text border border-border'"
            @click="rotDeg = 90"
          >顺时针90°</button>
          <button
            class="px-3 py-1.5 rounded-lg text-sm border-none cursor-pointer transition-colors"
            :class="rotDeg === -90 ? 'bg-primary text-white' : 'bg-bg-card text-text border border-border'"
            @click="rotDeg = -90"
          >逆时针90°</button>
        </template>
        <template v-else>
          <button
            class="px-3 py-1.5 rounded-lg text-sm border-none cursor-pointer transition-colors"
            :class="vScroll === 'up' ? 'bg-primary text-white' : 'bg-bg-card text-text border border-border'"
            @click="vScroll = 'up'"
          >上</button>
          <button
            class="px-3 py-1.5 rounded-lg text-sm border-none cursor-pointer transition-colors"
            :class="vScroll === 'down' ? 'bg-primary text-white' : 'bg-bg-card text-text border border-border'"
            @click="vScroll = 'down'"
          >下</button>
        </template>
        <span class="text-xs text-text-light">当前：{{ actualDir === 'h' ? '横向' : '纵向' }}{{ dirMode === 'auto' ? '（自动）' : '' }}</span>
        <button
          class="ml-auto px-4 py-2 rounded-lg bg-secondary text-text text-sm border-none cursor-pointer hover:bg-secondary-light transition-colors"
          @click="playing = !playing"
        >{{ playing ? '暂停' : '播放' }}</button>
        <button
          class="px-4 py-2 rounded-lg bg-bg-card text-text text-sm border border-border cursor-pointer hover:border-primary transition-colors"
          @click="toggleFullscreen"
        >全屏</button>
      </div>

      <div class="flex gap-4">
        <div class="flex-1">
          <label class="block text-sm text-text-light mb-2">文字大小（{{ fontSize }}px）</label>
          <div class="flex items-center gap-2">
            <input type="range" v-model.number="fontSize" min="16" :max="maxFont" step="2" class="flex-1 accent-primary" />
            <button
              class="px-3 py-1.5 rounded-lg text-sm border-none cursor-pointer bg-secondary text-text hover:bg-secondary-light transition-colors"
              @click="fillScreenFont"
            >一字撑满</button>
          </div>
        </div>
        <div class="flex-1">
          <label class="block text-sm text-text-light mb-2">滚动速度（{{ speed }}）</label>
          <input type="range" v-model.number="speed" min="1" max="10" class="w-full accent-primary" />
        </div>
      </div>

      <div class="flex flex-wrap gap-6">
        <div class="flex items-center gap-3">
          <label class="text-sm text-text-light w-16">文字颜色</label>
          <input
            v-model="textColor"
            type="color"
            class="w-10 h-10 border border-border rounded-lg cursor-pointer"
          />
          <input
            v-model="textColor"
            class="w-28 px-2 py-1.5 rounded-lg border border-border bg-bg-card text-text text-sm font-mono focus:outline-none focus:border-primary transition-colors"
          />
        </div>
        <div class="flex items-center gap-3">
          <label class="text-sm text-text-light w-16">背景颜色</label>
          <input
            v-model="bgColor"
            type="color"
            class="w-10 h-10 border border-border rounded-lg cursor-pointer"
          />
          <input
            v-model="bgColor"
            class="w-28 px-2 py-1.5 rounded-lg border border-border bg-bg-card text-text text-sm font-mono focus:outline-none focus:border-primary transition-colors"
          />
        </div>
      </div>

      <div class="flex gap-4 text-sm text-text-light">
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" v-model="ledDots" class="accent-primary" />
          LED 像素点阵
        </label>
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" v-model="glow" class="accent-primary" />
          文字发光
        </label>
      </div>
    </div>

    <div v-else-if="mode === 'warning'" class="mt-4 space-y-4">
      <div class="flex flex-wrap gap-2">
        <button class="px-4 py-2 rounded-lg bg-primary text-white text-sm border-none cursor-pointer hover:bg-primary-light transition-colors" @click="applyPreset('#FF0000', '#0026FF')">红蓝闪烁</button>
        <button class="px-4 py-2 rounded-lg bg-primary text-white text-sm border-none cursor-pointer hover:bg-primary-light transition-colors" @click="applyPreset('#FF0000', '#FFD700')">红黄闪烁</button>
        <button
          class="px-4 py-2 rounded-lg text-sm border-none cursor-pointer transition-colors"
          :class="warnRunning ? 'bg-red-600 text-white' : 'bg-secondary text-text hover:bg-secondary-light'"
          @click="toggleWarn"
        >{{ warnRunning ? '停止闪烁' : '开始闪烁' }}</button>
        <button class="px-4 py-2 rounded-lg bg-bg-card text-text text-sm border border-border cursor-pointer hover:border-primary transition-colors" @click="toggleFullscreen">全屏</button>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <span class="text-sm text-text-light">闪烁方式</span>
        <button
          class="px-3 py-1.5 rounded-lg text-sm border-none cursor-pointer transition-colors"
          :class="warnPattern === 'split' ? 'bg-primary text-white' : 'bg-bg-card text-text border border-border'"
          @click="warnPattern = 'split'"
        >双侧交替</button>
        <button
          class="px-3 py-1.5 rounded-lg text-sm border-none cursor-pointer transition-colors"
          :class="warnPattern === 'full' ? 'bg-primary text-white' : 'bg-bg-card text-text border border-border'"
          @click="warnPattern = 'full'"
        >全屏闪烁</button>
      </div>

      <div class="max-w-md">
        <label class="block text-sm text-text-light mb-2">闪烁速度（{{ warnSpeed }}）</label>
        <input type="range" v-model.number="warnSpeed" min="1" max="10" class="w-full accent-primary" />
      </div>

      <div class="flex flex-wrap gap-6">
        <div class="flex items-center gap-3">
          <label class="text-sm text-text-light w-16">颜色 A</label>
          <input
            v-model="warnA"
            type="color"
            class="w-10 h-10 border border-border rounded-lg cursor-pointer"
          />
          <input
            v-model="warnA"
            class="w-28 px-2 py-1.5 rounded-lg border border-border bg-bg-card text-text text-sm font-mono focus:outline-none focus:border-primary transition-colors"
          />
        </div>
        <div class="flex items-center gap-3">
          <label class="text-sm text-text-light w-16">颜色 B</label>
          <input
            v-model="warnB"
            type="color"
            class="w-10 h-10 border border-border rounded-lg cursor-pointer"
          />
          <input
            v-model="warnB"
            class="w-28 px-2 py-1.5 rounded-lg border border-border bg-bg-card text-text text-sm font-mono focus:outline-none focus:border-primary transition-colors"
          />
        </div>
      </div>
    </div>

    <div v-else class="mt-4 space-y-4">
      <div class="flex flex-wrap gap-2">
        <button
          class="px-4 py-2 rounded-lg text-sm border-none cursor-pointer transition-colors"
          :class="matrixPlaying ? 'bg-secondary text-text hover:bg-secondary-light' : 'bg-primary text-white'"
          @click="matrixPlaying = !matrixPlaying"
        >{{ matrixPlaying ? '暂停' : '播放' }}</button>
        <button class="px-4 py-2 rounded-lg bg-bg-card text-text text-sm border border-border cursor-pointer hover:border-primary transition-colors" @click="toggleFullscreen">全屏</button>
        <span class="self-center text-xs text-text-light">低功耗渲染 · 约 {{ matrixFps }} FPS</span>
      </div>

      <div class="flex gap-4">
        <div class="flex-1">
          <label class="block text-sm text-text-light mb-2">下落速度（{{ matrixSpeed }}）</label>
          <input type="range" v-model.number="matrixSpeed" min="1" max="10" class="w-full accent-primary" />
        </div>
        <div class="flex-1">
          <label class="block text-sm text-text-light mb-2">文字大小（{{ matrixSize }}px）</label>
          <input type="range" v-model.number="matrixSize" min="10" max="36" class="w-full accent-primary" />
        </div>
        <div class="flex-1">
          <label class="block text-sm text-text-light mb-2">帧率（{{ matrixFps }}）</label>
          <input type="range" v-model.number="matrixFps" min="8" max="30" class="w-full accent-primary" />
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <span class="text-sm text-text-light">字符集</span>
        <button
          v-for="opt in ([
            { id: 'kana', label: 'Matrix' },
            { id: 'binary', label: '0/1' },
            { id: 'digit', label: '数字' },
            { id: 'latin', label: '16 进制' },
            { id: 'han', label: '汉字' },
          ] as const)"
          :key="opt.id"
          class="px-3 py-1.5 rounded-lg text-sm border-none cursor-pointer transition-colors"
          :class="matrixCharset === opt.id ? 'bg-primary text-white' : 'bg-bg-card text-text border border-border'"
          @click="matrixCharset = opt.id"
        >{{ opt.label }}</button>
      </div>

      <div class="flex flex-wrap gap-6">
        <div class="flex items-center gap-3">
          <label class="text-sm text-text-light w-16">文字颜色</label>
          <input
            v-model="matrixColor"
            type="color"
            class="w-10 h-10 border border-border rounded-lg cursor-pointer"
          />
          <input
            v-model="matrixColor"
            class="w-28 px-2 py-1.5 rounded-lg border border-border bg-bg-card text-text text-sm font-mono focus:outline-none focus:border-primary transition-colors"
          />
        </div>
        <div class="flex items-center gap-3">
          <label class="text-sm text-text-light w-16">背景颜色</label>
          <input
            v-model="matrixBg"
            type="color"
            class="w-10 h-10 border border-border rounded-lg cursor-pointer"
          />
          <input
            v-model="matrixBg"
            class="w-28 px-2 py-1.5 rounded-lg border border-border bg-bg-card text-text text-sm font-mono focus:outline-none focus:border-primary transition-colors"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style>
@keyframes led-x {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}
@keyframes led-y-up {
  from { transform: translateY(0); }
  to { transform: translateY(-50%); }
}
@keyframes led-y-down {
  from { transform: translateY(-50%); }
  to { transform: translateY(0); }
}
.led-grid {
  background-image: radial-gradient(circle, rgba(0, 0, 0, 0.4) 1px, transparent 1.4px);
  background-size: 4px 4px;
}
.marquee-h {
  will-change: transform;
}
.marquee-v {
  will-change: transform;
}
.led-fullscreen-host:fullscreen {
  width: 100vw !important;
  height: 100vh !important;
  border: none;
  border-radius: 0;
}
</style>

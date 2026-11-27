<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import CopyButton from '../../components/CopyButton.vue'
import MiniChart from './MiniChart.vue'
import { fmtBytes, fmtBitrate, fmtSpeed, fmtTime, fmtClock, fmtDateShort, shortUrl, readyStateName, networkStateName } from './format'

// ---------- 播放引擎（按需动态加载，避免打进同一个 chunk） ----------
let HlsCls: any = null
let mpegtsMod: any = null
let dashjsMod: any = null
const engineLoaded = reactive({ hls: false, flv: false, dash: false })
const engineVersions = reactive({ hls: '', flv: '', dash: '' })

async function loadEngine(type: StreamType) {
  if (type === 'hls' && !HlsCls) {
    const mod: any = await import('hls.js')
    HlsCls = mod.default ?? mod
    engineVersions.hls = HlsCls.version ?? ''
    engineLoaded.hls = true
  } else if (type === 'flv' && !mpegtsMod) {
    const mod: any = await import('mpegts.js')
    mpegtsMod = mod.default ?? mod
    engineVersions.flv = mpegtsMod.version ?? ''
    engineLoaded.flv = true
  } else if (type === 'dash' && !dashjsMod) {
    dashjsMod = await import('dashjs')
    engineVersions.dash = (dashjsMod as any).Version?.() ?? ''
    engineLoaded.dash = true
  }
}

type StreamType = 'flv' | 'hls' | 'dash'
type TypeSel = 'auto' | StreamType
type LiveMode = 'auto' | 'live' | 'vod'
type Level = 'info' | 'warn' | 'error'
type Status = 'idle' | 'loading' | 'playing' | 'paused' | 'buffering' | 'ended' | 'error'

// ---------- 控制状态 ----------
const url = ref('')
const typeSel = ref<TypeSel>('auto')
const liveMode = ref<LiveMode>('auto')
const autoplay = ref(true)
const muted = ref(false)

const videoRef = ref<HTMLVideoElement | null>(null)

// ---------- 测试流下拉（预置 + 播放历史） ----------
interface StreamSuggestion {
  url: string
  type: StreamType
  builtin: boolean
  time: number
}

const DEFAULT_STREAMS: { url: string; type: StreamType }[] = [
  { url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8', type: 'hls' },
  { url: 'https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd', type: 'dash' },
  { url: 'https://sf1-cdn-tos.huoshanstatic.com/obj/media-fe/xgplayer_doc_video/flv/xgplayer-demo-360p.flv', type: 'flv' },
]

const HISTORY_KEY = 'stream-debugger-history'
const HISTORY_MAX = 20

const history = ref<{ url: string; type: StreamType; time: number }[]>([])
const showDropdown = ref(false)
const filterActive = ref(false)
const urlBoxEl = ref<HTMLElement | null>(null)

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) {
        history.value = parsed
          .filter((x: any) => x && typeof x.url === 'string')
          .slice(0, HISTORY_MAX)
      }
    }
  } catch { /* ignore */ }
}

function persistHistory() {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.value))
  } catch { /* ignore */ }
}

function rememberStream(u: string, t: StreamType) {
  // 预置测试流不进历史，历史只保存用户播放过的其它流
  if (DEFAULT_STREAMS.some(s => s.url === u)) return
  const list = history.value.filter(h => h.url !== u)
  list.unshift({ url: u, type: t, time: Date.now() })
  history.value = list.slice(0, HISTORY_MAX)
  persistHistory()
}

function removeHistory(u: string) {
  history.value = history.value.filter(h => h.url !== u)
  persistHistory()
}

function clearHistory() {
  history.value = []
  persistHistory()
}

const suggestions = computed<StreamSuggestion[]>(() => {
  const kw = filterActive.value ? url.value.trim().toLowerCase() : ''
  const all: StreamSuggestion[] = [
    ...DEFAULT_STREAMS.map(s => ({ url: s.url, type: s.type, builtin: true, time: 0 })),
    ...history.value
      .filter(h => !DEFAULT_STREAMS.some(s => s.url === h.url))
      .map(h => ({ ...h, builtin: false })),
  ]
  return kw ? all.filter(s => s.url.toLowerCase().includes(kw)) : all
})

function selectStream(item: StreamSuggestion) {
  url.value = item.url
  showDropdown.value = false
  filterActive.value = false
}

function typeBadgeClass(t: StreamType) {
  return t === 'flv'
    ? 'bg-orange-100 text-orange-600'
    : t === 'hls'
      ? 'bg-sky-100 text-sky-600'
      : 'bg-green-100 text-green-600'
}

function onDocClick(e: MouseEvent) {
  if (showDropdown.value && urlBoxEl.value && !urlBoxEl.value.contains(e.target as Node)) {
    showDropdown.value = false
  }
}
const status = ref<Status>('idle')
const errorMsg = ref('')
const engineName = ref('')
const engineVer = ref('')
const isLive = ref(false)

// ---------- 概览数据 ----------
const media = reactive({
  mimeType: '',
  videoCodec: '',
  audioCodec: '',
  width: 0,
  height: 0,
  fps: 0,
  duration: NaN,
  hasAudio: undefined as boolean | undefined,
  hasVideo: undefined as boolean | undefined,
  chroma: '',
  videoDataRate: 0,
  audioDataRate: 0,
})

const stat = reactive({
  currentTime: 0,
  bufferedAhead: 0,
  bufferEnd: 0,
  readyState: 0,
  networkState: 0,
  seekStart: 0,
  seekEnd: 0,
  liveLatency: NaN,
  abrThroughput: NaN,
  downloadSpeed: 0,
  fps: 0,
  decodedFrames: 0,
  droppedFrames: 0,
  totalFrames: 0,
  corruptedFrames: 0,
  videoWidth: 0,
  videoHeight: 0,
  playbackRate: 1,
  volume: 1,
  videoMuted: false,
})

const bufferedRanges = ref<{ start: number; end: number }[]>([])
const engineExtras = ref<{ label: string; value: string }[]>([])

// ---------- 图表 ----------
const MAX_POINTS = 180
const chartSpeed = ref<number[]>([])
const chartBuffer = ref<number[]>([])
const chartFps = ref<number[]>([])

// ---------- 清晰度 ----------
interface LevelRow {
  idx: number
  id: number | string
  label: string
  bitrate: number
  width: number
  height: number
  codec: string
  current: boolean
}
const levels = ref<LevelRow[]>([])
const autoLevel = ref(true)

// ---------- 分片加载 ----------
interface SegRow {
  t: string
  engine: string
  id: string
  size: number
  ms: number
  bps: number
}
/** 列表只保留最近 SEG_MAX 条，全量数据折算进 segSummary，防止无限增长 */
const SEG_MAX = 300
const PAGE_SIZE = 20
const segments = ref<SegRow[]>([])
const segShown = ref(PAGE_SIZE)
const segSummary = reactive({ count: 0, bytes: 0, msSum: 0, bpsSum: 0 })
const segVisible = computed(() => segments.value.slice(0, segShown.value))

// ---------- 网络请求 ----------
interface NetRow {
  url: string
  name: string
  type: string
  size: number
  ms: number
}
const NET_MAX = 300
const netRows = ref<NetRow[]>([])
const netShown = ref(PAGE_SIZE)
const netSummary = reactive({ count: 0, bytes: 0, msSum: 0 })
const netVisible = computed(() => netRows.value.slice(0, netShown.value))
/** 引擎上报的按 URL 字节数（跨域未暴露 Resource Timing 大小时用于补齐） */
const engineBytesByUrl = new Map<string, number>()

function noteEngineBytes(u: string | undefined, bytes: number) {
  if (!u || !(bytes > 0)) return
  engineBytesByUrl.set(u, bytes)
  if (engineBytesByUrl.size > 500) engineBytesByUrl.clear()
  const row = netRows.value.find(r => r.url === u && r.size === 0)
  if (row) row.size = bytes
}

// ---------- 日志 ----------
interface LogRow {
  t: string
  level: Level
  tag: string
  msg: string
}
const logs = ref<LogRow[]>([])
const logFilter = ref('')
const autoScroll = ref(true)
const logsEl = ref<HTMLElement | null>(null)

function log(level: Level, tag: string, msg: string) {
  logs.value.push({ t: fmtClock(new Date()), level, tag, msg })
  if (logs.value.length > 2000) logs.value.splice(0, logs.value.length - 2000)
  if (autoScroll.value) {
    nextTick(() => {
      const el = logsEl.value
      if (el) el.scrollTop = el.scrollHeight
    })
  }
}

const filteredLogs = computed(() => {
  const kw = logFilter.value.trim().toLowerCase()
  if (!kw) return logs.value
  return logs.value.filter(r => `${r.tag} ${r.msg} ${r.level}`.toLowerCase().includes(kw))
})

const logText = computed(() => filteredLogs.value.map(r => `[${r.t}] [${r.level}] [${r.tag}] ${r.msg}`).join('\n'))

// ---------- 事件摘要 ----------
function summarize(payload: unknown): string {
  if (payload == null) return ''
  if (typeof payload !== 'object') return String(payload)
  const parts: string[] = []
  for (const [k, v] of Object.entries(payload as Record<string, unknown>)) {
    if (v == null || typeof v === 'function') continue
    if (typeof v === 'object') {
      const obj = v as Record<string, unknown>
      const bits: string[] = []
      if (typeof obj.url === 'string') bits.push(shortUrl(obj.url, 32))
      if (typeof obj.sn !== 'undefined') bits.push(`sn=${obj.sn}`)
      if (typeof obj.level !== 'undefined') bits.push(`lv=${obj.level}`)
      if (typeof obj.start === 'number') bits.push(`t=${obj.start.toFixed(2)}`)
      if (typeof obj.byteLength === 'number') bits.push(`len=${fmtBytes(obj.byteLength)}`)
      if (bits.length) parts.push(`${k}{${bits.join(' ')}}`)
      continue
    }
    parts.push(`${k}=${typeof v === 'number' ? (Number.isInteger(v) ? v : v.toFixed(2)) : String(v)}`)
    if (parts.length >= 8) break
  }
  return parts.join(' ')
}

// ---------- 引擎实例 ----------
let hlsRef: any = null
let flvRef: any = null
let flvStatsCache: any = null
let dashRef: any = null
let pollTimer: number | null = null
let vfcHandle = 0
let frameCount = 0
let lastPollAt = 0
let lastDisplayedFrames = -1
let lastTotalBytes = 0
let lastEngineBytes = 0
let engineBytesTotal = 0
let resTotalBytes = 0
let speedSource: 'engine' | 'resource' = 'resource'
const speedEvents: { t: number; bytes: number }[] = []
let startMark = 0
let targetHost = ''
let playToken = 0
const throttleMap: Record<string, number> = {}

function throttled(key: string, intervalMs: number): boolean {
  const now = Date.now()
  if (throttleMap[key] && now - throttleMap[key] < intervalMs) return true
  throttleMap[key] = now
  return false
}

function recordSegment(engine: string, id: string, size: number, ms: number, mediaDur = 0) {
  const bps = ms > 0 && size > 0 ? (size * 8 * 1000) / ms : 0
  engineBytesTotal += size
  segSummary.count++
  segSummary.bytes += size
  segSummary.msSum += ms
  segSummary.bpsSum += bps
  segments.value.unshift({ t: fmtClock(new Date()), engine, id, size, ms, bps })
  if (segments.value.length > SEG_MAX) segments.value.pop()
  if (mediaDur > 0 && size > 0) {
    log('info', engine, `分片 ${id} ${fmtBytes(size)} 耗时 ${ms.toFixed(0)}ms 码率 ${fmtBitrate((size * 8) / mediaDur)}`)
  }
}

// ---------- 类型识别 ----------
function detectType(raw: string): StreamType | null {
  const u = raw.toLowerCase()
  const path = u.split('?')[0].split('#')[0]
  if (path.endsWith('.m3u8') || u.includes('.m3u8')) return 'hls'
  if (path.endsWith('.mpd') || u.includes('.mpd')) return 'dash'
  if (path.endsWith('.flv') || u.includes('.flv')) return 'flv'
  return null
}

// ---------- 生命周期 ----------
onMounted(() => {
  loadHistory()
  bindVideoEvents()
  window.addEventListener('keydown', onKey)
  document.addEventListener('click', onDocClick)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  document.removeEventListener('click', onDocClick)
  stop()
})

function onKey(e: KeyboardEvent) {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return
  const video = videoRef.value
  if (!video) return
  if (e.code === 'Space') {
    e.preventDefault()
    video.paused ? video.play().catch(() => {}) : video.pause()
  }
}

watch(muted, v => {
  if (videoRef.value) videoRef.value.muted = v
})

// ---------- 播放控制 ----------
/** 切换流时清空上一路流的全部数据，避免残留 */
function resetStreamData() {
  media.mimeType = ''
  media.videoCodec = ''
  media.audioCodec = ''
  media.width = 0
  media.height = 0
  media.fps = 0
  media.duration = NaN
  media.hasAudio = undefined
  media.hasVideo = undefined
  media.chroma = ''
  media.videoDataRate = 0
  media.audioDataRate = 0
  isLive.value = false
  stat.currentTime = 0
  stat.bufferedAhead = 0
  stat.bufferEnd = 0
  stat.readyState = 0
  stat.networkState = 0
  stat.seekStart = 0
  stat.seekEnd = 0
  stat.liveLatency = NaN
  stat.abrThroughput = NaN
  stat.downloadSpeed = 0
  stat.fps = 0
  stat.decodedFrames = 0
  stat.droppedFrames = 0
  stat.totalFrames = 0
  stat.corruptedFrames = 0
  stat.videoWidth = 0
  stat.videoHeight = 0
  stat.playbackRate = 1
  stat.volume = 1
  stat.videoMuted = false
  bufferedRanges.value = []
  engineExtras.value = []
  levels.value = []
  autoLevel.value = true
  segments.value = []
  segShown.value = PAGE_SIZE
  segSummary.count = 0
  segSummary.bytes = 0
  segSummary.msSum = 0
  segSummary.bpsSum = 0
  netRows.value = []
  netShown.value = PAGE_SIZE
  netSummary.count = 0
  netSummary.bytes = 0
  netSummary.msSum = 0
  engineBytesByUrl.clear()
  chartSpeed.value = []
  chartBuffer.value = []
  chartFps.value = []
}

async function play() {
  const src = url.value.trim()
  if (!src) {
    errorMsg.value = '请输入流地址'
    return
  }
  const type = typeSel.value === 'auto' ? detectType(src) : typeSel.value
  if (!type) {
    errorMsg.value = '无法从 URL 识别流类型（.flv / .m3u8 / .mpd），请手动选择流类型'
    return
  }
  stop(true)
  const token = playToken
  errorMsg.value = ''
  showDropdown.value = false
  rememberStream(src, type)
  try {
    targetHost = new URL(src, location.href).hostname
  } catch {
    targetHost = ''
  }
  startMark = performance.now()
  lastTotalBytes = 0
  lastEngineBytes = 0
  engineBytesTotal = 0
  resTotalBytes = 0
  flvStatsCache = null
  speedSource = 'resource'
  speedEvents.length = 0
  resetStreamData()
  status.value = 'loading'
  log('info', 'player', `开始播放 [${type}] ${src}`)

  const video = videoRef.value!
  video.muted = muted.value
  video.load()

  try {
    await loadEngine(type)
    if (token !== playToken) return // 引擎加载期间被停止或切换
    if (type === 'hls') initHls(src)
    else if (type === 'flv') initFlv(src)
    else initDash(src)
  } catch (e: any) {
    status.value = 'error'
    errorMsg.value = e?.message ?? String(e)
    log('error', 'player', `初始化失败: ${errorMsg.value}`)
    return
  }

  startPolling()
  if (autoplay.value) {
    if (type === 'dash') {
      // DASH 交给 dash.js 的 autoPlay 自行启动：PLAYBACK_STARTED 由 video 的 play 事件触发，
      // 而 dash.js 要在清单/流初始化完成后才挂上该监听。若这里抢先 video.play()，
      // play 事件会被“偷走”，dash.js 将永不刷新清单（ManifestUpdater 一直处于 isPaused），
      // 直播流会因滑动窗口不推进而卡死。
    } else {
      const p = video.play()
      if (p && typeof p.catch === 'function') {
        p.catch((err: any) => {
          log('warn', 'player', `自动播放被浏览器拦截，请点击播放按钮: ${err?.message ?? err}`)
        })
      }
    }
  }
}

function stop(keepLogs = false) {
  playToken++
  stopPolling()
  try {
    if (hlsRef) { hlsRef.destroy(); hlsRef = null }
    if (flvRef) { flvRef.pause?.(); flvRef.unload?.(); flvRef.detachMediaElement?.(); flvRef.destroy?.(); flvRef = null }
    if (dashRef) { dashRef.destroy?.(); dashRef = null }
  } catch (e: any) {
    log('warn', 'player', `销毁播放器异常: ${e?.message ?? e}`)
  }
  const video = videoRef.value
  if (video) {
    video.removeAttribute('src')
    video.load()
  }
  if (!keepLogs) {
    status.value = 'idle'
    engineName.value = ''
    engineVer.value = ''
  }
  levels.value = []
  engineExtras.value = []
}

// ---------- HLS (hls.js) ----------
function initHls(src: string) {
  engineName.value = 'hls.js'
  engineVer.value = HlsCls.version
  if (HlsCls.isSupported()) {
    const hls = new HlsCls({
      enableWorker: true,
      lowLatencyMode: liveMode.value === 'live',
      backBufferLength: 90,
    })
    hlsRef = hls
    bindHlsEvents(hls)
    hls.loadSource(src)
    hls.attachMedia(videoRef.value!)
  } else {
    const video = videoRef.value!
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      engineName.value = 'Native HLS (Safari)'
      log('warn', 'hls.js', '当前浏览器不支持 MSE，使用原生 HLS 播放，统计数据有限')
      video.src = src
    } else {
      throw new Error('当前浏览器不支持 hls.js (MSE 不可用)')
    }
  }
}

function bindHlsEvents(hls: any) {
  const E = HlsCls.Events
  const alwaysLog = new Set<string>([
    E.ERROR,
    E.MANIFEST_PARSED,
    E.MANIFEST_LOADED,
    E.LEVEL_LOADED,
    E.LEVEL_SWITCHED,
    E.LEVEL_UPDATED,
    E.AUDIO_TRACK_SWITCHED,
    E.SUBTITLE_TRACK_SWITCH,
  ])
  for (const [name, type] of Object.entries(E) as [string, string][]) {
    hls.on(type, (_event: string, data: any) => {
      if (type === E.FRAG_LOADED) {
        const f = data?.frag ?? {}
        const stats = f.stats ?? {}
        const bytes = stats.loaded ?? stats.total ?? f.byteLength ?? 0
        const loadMs = stats.loading ? Math.max(0, stats.loading.end - stats.loading.start) : 0
        noteEngineBytes(f.url, bytes)
        recordSegment('hls.js', `L${f.level ?? '?'} SN${f.sn ?? '?'}${f.type ? ` (${f.type})` : ''}`, bytes, loadMs, f.duration)
        if (throttled('hls-frag-log', 2000)) return
      }
      if (type === E.ERROR) {
        const fatal = data?.fatal ? ' [fatal]' : ''
        const code = data?.response?.code ? ` HTTP ${data.response.code}` : ''
        const err = data?.error?.message ?? data?.error ?? ''
        const level: Level = data?.fatal ? 'error' : 'warn'
        log(level, 'hls.js', `${data?.type ?? '?'}/${data?.details ?? '?'}${code}${err ? ` ${err}` : ''}${fatal}`)
        if (data?.fatal) {
          status.value = 'error'
          errorMsg.value = `hls.js 致命错误: ${data.type}/${data.details}`
          // 常见恢复手段
          try {
            if (data.type === HlsCls.ErrorTypes.NETWORK_ERROR) {
              log('warn', 'hls.js', '尝试恢复网络错误: startLoad()')
              hls.startLoad()
            } else if (data.type === HlsCls.ErrorTypes.MEDIA_ERROR) {
              log('warn', 'hls.js', '尝试恢复媒体错误: recoverMediaError()')
              hls.recoverMediaError()
            }
          } catch (e: any) {
            log('error', 'hls.js', `恢复失败: ${e?.message ?? e}`)
          }
        }
        return
      }
      if (!alwaysLog.has(type) && throttled(`hls-${type}`, 2000)) return
      log('info', 'hls.js', `${name}: ${summarize(data)}`)
    })
  }
}

function refreshHlsLevels() {
  const hls = hlsRef
  if (!hls) return
  const arr: LevelRow[] = (hls.levels ?? []).map((l: any, i: number) => ({
    idx: i,
    id: i,
    label: l.name || `L${i}`,
    bitrate: l.bitrate ?? 0,
    width: l.width ?? 0,
    height: l.height ?? 0,
    codec: [l.videoCodec, l.audioCodec].filter(Boolean).join(' / ') || l.codecSet || '',
    current: i === hls.currentLevel || (hls.currentLevel === -1 && i === hls.loadLevel),
  }))
  levels.value = arr
  autoLevel.value = hls.currentLevel === -1
  if (hls.levels?.length) {
    const lv = hls.levels[Math.max(hls.currentLevel, 0)]
    media.videoCodec = media.videoCodec || lv?.videoCodec || ''
    media.audioCodec = media.audioCodec || lv?.audioCodec || ''
  }
}

function setHlsLevel(i: number) {
  if (!hlsRef) return
  hlsRef.currentLevel = i
  autoLevel.value = i === -1
  log('info', 'hls.js', i === -1 ? '切换为自动清晰度 (ABR)' : `锁定清晰度 L${i}`)
  refreshHlsLevels()
}

function setLevel(i: number) {
  if (hlsRef) setHlsLevel(i)
  else if (dashRef) setDashLevel(i)
  else log('warn', 'player', '当前引擎不支持清晰度切换')
}

// ---------- FLV (mpegts.js) ----------
function initFlv(src: string) {
  engineName.value = 'mpegts.js'
  engineVer.value = mpegtsMod.version ?? ''
  if (!mpegtsMod.isSupported()) {
    throw new Error('当前浏览器不支持 mpegts.js (MSE 不可用)')
  }
  const dataSource: any = {
    type: 'flv',
    url: src,
    cors: true,
  }
  if (liveMode.value === 'live') dataSource.isLive = true
  if (liveMode.value === 'vod') dataSource.isLive = false

  const player = mpegtsMod.createPlayer(dataSource, {
    enableWorker: true,
    lazyLoad: false,
    autoCleanupMinBackwardDuration: 60,
    autoCleanupMaxBackwardDuration: 180,
    autoCleanupSourceBuffer: true,
  } as any)
  flvRef = player
  player.attachMediaElement(videoRef.value!)
  bindFlvEvents(player)
  player.load()

  const featureList = mpegtsMod.getFeatureList?.()
  if (featureList) {
    log('info', 'mpegts.js', `特性: ${summarize(featureList)}`)
  }
}

function bindFlvEvents(player: any) {
  const E = mpegtsMod.Events
  const on = (name: string, key: string, cb?: (data: any) => void) => {
    player.on(key, (data: any) => {
      cb?.(data)
      if (throttled(`flv-${name}`, 1500)) return
      log(name === 'ERROR' ? 'error' : 'info', 'mpegts.js', `${name}: ${summarize(data)}`)
    })
  }

  player.on(E.ERROR, (errorType: string, errorDetails: string, info: any) => {
    status.value = 'error'
    errorMsg.value = `mpegts.js 错误: ${errorType} / ${errorDetails}`
    log('error', 'mpegts.js', `${errorType} / ${errorDetails} ${info?.msg ? `(${info.msg})` : ''}`)
    if (info?.code) log('error', 'mpegts.js', `HTTP 状态码: ${info.code}`)
  })
  player.on(E.MEDIA_INFO, (info: any) => {
    media.mimeType = info.mimeType ?? ''
    media.videoCodec = info.videoCodec ?? ''
    media.audioCodec = info.audioCodec ?? ''
    media.width = info.width ?? 0
    media.height = info.height ?? 0
    media.fps = info.fps ?? 0
    media.duration = info.duration ?? NaN
    media.hasAudio = info.hasAudio
    media.hasVideo = info.hasVideo
    media.chroma = info.chromaFormat ?? ''
    media.videoDataRate = info.videoDataRate ?? 0
    media.audioDataRate = info.audioDataRate ?? 0
    isLive.value = !isFinite(info.duration) || info.duration === 0 ? true : isLive.value
    log('info', 'mpegts.js', `MEDIA_INFO: ${summarize(info)}`)
  })
  player.on(E.STATISTICS_INFO, (info: any) => {
    flvStatsCache = { ...info }
    if (throttled('flv-stats', 5000)) return
    log('info', 'mpegts.js', `STATISTICS_INFO: ${summarize(info)}`)
  })
  player.on(E.LOADING_COMPLETE, () => {
    log('info', 'mpegts.js', 'LOADING_COMPLETE: 数据加载完毕（播放继续）')
  })
  player.on(E.RECOVERED_EARLY_EOF, () => {
    log('warn', 'mpegts.js', 'RECOVERED_EARLY_EOF: 提前 EOF 已恢复')
  })
  on('METADATA_ARRIVED', E.METADATA_ARRIVED)
  on('SCRIPTDATA_ARRIVED', E.SCRIPTDATA_ARRIVED)
}

// ---------- DASH (dash.js) ----------
function initDash(src: string) {
  const D = dashjsMod
  engineName.value = 'dash.js'
  const player = D.MediaPlayer().create()
  dashRef = player
  engineVer.value = player.getVersion?.() ?? ''
  player.updateSettings({
    streaming: {
      abr: { autoSwitchBitrate: { video: true, audio: true } },
      buffer: { fastSwitchEnabled: true },
    },
  })
  bindDashEvents(player)
  player.initialize(videoRef.value!, src, autoplay.value)
}

function refreshDashLevels() {
  const player = dashRef
  if (!player) return
  try {
    const reps: any[] = player.getRepresentationsByType('video') ?? []
    const current = player.getCurrentRepresentationForType?.('video')
    levels.value = reps.map((rep: any, i: number) => {
      const bitrate = Number(rep.bitrate ?? rep.bandwidth ?? (rep.bitrateInKbit ? rep.bitrateInKbit * 1000 : 0)) || 0
      return {
        idx: i,
        id: rep.id ?? i,
        label: rep.id ? `Rep ${rep.id}` : `R${i}`,
        bitrate,
        width: rep.width ?? 0,
        height: rep.height ?? 0,
        codec: rep.codec ?? rep.codecs ?? `${rep.mimeType ?? ''}`.trim(),
        current: current ? (current === rep || (current.id != null && current.id === rep.id)) : i === 0,
      }
    })
    // 填充概览卡的编码信息（DASH 视/音频分开描述）
    if (reps.length && !media.videoCodec) {
      const c = String(reps[0].codec ?? reps[0].codecs ?? '').trim()
      if (c) media.videoCodec = c
    }
    const audioReps: any[] = player.getRepresentationsByType('audio') ?? []
    if (audioReps.length && !media.audioCodec) {
      const c = String(audioReps[0].codec ?? audioReps[0].codecs ?? '').trim()
      if (c) media.audioCodec = c
    }
  } catch (e: any) {
    log('warn', 'dash.js', `读取清晰度列表失败: ${e?.message ?? e}`)
  }
}

function setDashLevel(i: number) {
  const player = dashRef
  if (!player) return
  try {
    if (i === -1) {
      player.updateSettings({ streaming: { abr: { autoSwitchBitrate: { video: true, audio: true } } } })
      autoLevel.value = true
      log('info', 'dash.js', '切换为自动清晰度 (ABR)')
    } else {
      player.updateSettings({ streaming: { abr: { autoSwitchBitrate: { video: false, audio: true } } } })
      player.setRepresentationForTypeByIndex('video', i)
      autoLevel.value = false
      log('info', 'dash.js', `锁定清晰度 index=${i}`)
    }
    refreshDashLevels()
  } catch (e: any) {
    log('error', 'dash.js', `切换清晰度失败: ${e?.message ?? e}`)
  }
}

const DASH_SKIP_LOG = new Set([
  'playbackTimeUpdated',
  'playbackProgress',
  'playbackRateChanged',
  'bufferLevelUpdated',
  'bufferLevelStateChanged',
  'metricAdded',
  'metricUpdated',
  'metricChanged',
  'log',
  'ttmlParsed',
  'ttmlToParse',
])

function bindDashEvents(player: any) {
  const events = dashjsMod.MediaPlayer.events as Record<string, string>
  for (const [name, type] of Object.entries(events)) {
    player.on(type, (e: any) => {
      if (type === 'error') {
        const detail = e?.error ?? e?.message ?? ''
        const code = e?.code ?? ''
        log('error', 'dash.js', `ERROR ${code} ${e?.eventType ?? ''} ${detail}`.trim())
        if (e?.error === 'download' || e?.error === 'manifestError') {
          status.value = 'error'
          errorMsg.value = `dash.js 错误: ${e?.error ?? 'error'}`
        }
        return
      }
      if (type === 'fragmentLoadingCompleted') {
        const req = e?.request ?? {}
        const bytes = req.bytesLoaded ?? req.bytesTotal ?? 0
        const start = req.trequest ?? (req.startDate ? new Date(req.startDate).getTime() : 0)
        const end = req.tresponse ?? (req.endDate ? new Date(req.endDate).getTime() : 0)
        const ms = start && end && end > start ? end - start : 0
        const id = `Q${req.quality ?? '?'} ${shortUrl(req.url ?? '', 40)}`
        noteEngineBytes(req.url, bytes)
        recordSegment('dash.js', id, bytes, ms, req.mediaDuration)
        if (throttled('dash-frag-log', 2000)) return
      }
      if (type === 'qualityChangeRendered') {
        refreshDashLevels()
        log('info', 'dash.js', `QUALITY_CHANGE_RENDERED: ${e?.mediaType} ${e?.oldQuality} → ${e?.newQuality}`)
        return
      }
      if (type === 'streamInitialized' || type === 'manifestLoaded' || type === 'periodSwitchCompleted') {
        refreshDashLevels()
      }
      // 各类请求完成事件都带 request/requestObject，顺带记录字节数
      for (const key of ['request', 'requestObject']) {
        const rq = e?.[key]
        if (rq?.url && typeof rq.bytesLoaded === 'number') noteEngineBytes(rq.url, rq.bytesLoaded)
      }
      if (DASH_SKIP_LOG.has(type)) return
      if (throttled(`dash-${type}`, 2000)) return
      log('info', 'dash.js', `${name}: ${summarize(e)}`)
    })
  }
}

// ---------- 视频元素事件 ----------
function bindVideoEvents() {
  const video = videoRef.value!
  const bind = (name: string, handler: () => void) => video.addEventListener(name, handler)
  bind('loadedmetadata', () => {
    status.value = 'paused'
    log('info', 'video', `loadedmetadata: ${video.videoWidth}x${video.videoHeight} duration=${isFinite(video.duration) ? video.duration.toFixed(2) : 'live'}`)
  })
  bind('canplay', () => log('info', 'video', `canplay (readyState=${video.readyState})`))
  bind('play', () => { status.value = 'playing'; log('info', 'video', 'play') })
  bind('playing', () => { status.value = 'playing'; log('info', 'video', `playing t=${video.currentTime.toFixed(2)}`) })
  bind('pause', () => { status.value = 'paused'; log('info', 'video', `pause t=${video.currentTime.toFixed(2)}`) })
  bind('waiting', () => { status.value = 'buffering'; log('warn', 'video', `waiting (缓冲中) t=${video.currentTime.toFixed(2)}`) })
  bind('stalled', () => log('warn', 'video', 'stalled (数据停滞)'))
  bind('seeking', () => log('info', 'video', `seeking → ${video.currentTime.toFixed(2)}`))
  bind('seeked', () => log('info', 'video', `seeked → ${video.currentTime.toFixed(2)}`))
  bind('ended', () => { status.value = 'ended'; log('info', 'video', 'ended') })
  bind('emptied', () => log('info', 'video', 'emptied'))
  bind('durationchange', () => log('info', 'video', `durationchange: ${isFinite(video.duration) ? video.duration.toFixed(2) : 'Infinity'}`))
  bind('error', () => {
    const err = video.error
    if (!video.currentSrc) return
    status.value = 'error'
    errorMsg.value = `video 元素错误: code=${err?.code} ${err?.message ?? ''}`
    log('error', 'video', `mediaError code=${err?.code} message=${err?.message ?? '-'}`)
  })
}

// ---------- 轮询统计 ----------
function startPolling() {
  stopPolling()
  frameCount = 0
  lastDisplayedFrames = -1
  lastPollAt = performance.now()
  const video = videoRef.value!
  const loop = () => {
    frameCount++
    vfcHandle = video.requestVideoFrameCallback ? video.requestVideoFrameCallback(loop) : 0
  }
  loop()
  pollTimer = window.setInterval(poll, 1000)
  poll()
}

function stopPolling() {
  if (pollTimer !== null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  const video = videoRef.value
  if (video && vfcHandle && (video as any).cancelVideoFrameCallback) {
    (video as any).cancelVideoFrameCallback(vfcHandle)
  }
  vfcHandle = 0
}

function poll() {
  const video = videoRef.value
  if (!video) return
  const now = performance.now()
  const dt = (now - lastPollAt) / 1000
  lastPollAt = now

  stat.currentTime = video.currentTime
  stat.videoWidth = video.videoWidth
  stat.videoHeight = video.videoHeight
  stat.readyState = video.readyState
  stat.networkState = video.networkState
  stat.playbackRate = video.playbackRate
  stat.volume = video.volume
  stat.videoMuted = video.muted
  stat.seekStart = video.seekable.length ? video.seekable.start(0) : 0
  stat.seekEnd = video.seekable.length ? video.seekable.end(video.seekable.length - 1) : 0

  // 缓冲区
  const ranges: { start: number; end: number }[] = []
  let ahead = 0
  let bufferEnd = 0
  for (let i = 0; i < video.buffered.length; i++) {
    const s = video.buffered.start(i)
    const e = video.buffered.end(i)
    ranges.push({ start: s, end: e })
    if (video.currentTime >= s - 0.1 && video.currentTime <= e) {
      ahead = e - video.currentTime
      bufferEnd = e
    }
  }
  bufferedRanges.value = ranges
  stat.bufferedAhead = ahead
  stat.bufferEnd = bufferEnd

  // FPS（优先用 getVideoPlaybackQuality 的已显示帧差分，rVFC 作兜底）
  const q = (video as any).getVideoPlaybackQuality?.()
  if (q) {
    const displayed = (q.totalVideoFrames ?? 0) - (q.droppedVideoFrames ?? 0)
    if (dt > 0 && lastDisplayedFrames >= 0) {
      const fps = Math.max(0, (displayed - lastDisplayedFrames) / dt)
      stat.fps = stat.fps ? stat.fps * 0.5 + fps * 0.5 : fps
    }
    lastDisplayedFrames = displayed
    stat.totalFrames = q.totalVideoFrames ?? 0
    stat.droppedFrames = q.droppedVideoFrames ?? 0
    stat.corruptedFrames = q.corruptedVideoFrames ?? 0
    stat.decodedFrames = stat.totalFrames - stat.droppedFrames
  } else {
    if (dt > 0) {
      const fps = frameCount / dt
      stat.fps = stat.fps ? stat.fps * 0.5 + fps * 0.5 : fps
    }
  }
  frameCount = 0

  // 网络请求增量采集（每条只处理一次，开销恒定，长播不累积）
  ingestResourceTiming()

  // 下载速率：优先使用引擎上报的分片字节（跨域资源 Timing 常不暴露大小），否则退回 Resource Timing
  const source: 'engine' | 'resource' = engineBytesTotal > 0 ? 'engine' : 'resource'
  if (source !== speedSource) {
    speedSource = source
    speedEvents.length = 0
  }
  const delta = source === 'engine' ? engineBytesTotal - lastEngineBytes : resTotalBytes - lastTotalBytes
  if (delta > 0) speedEvents.push({ t: now, bytes: delta })
  while (speedEvents.length && speedEvents[0].t < now - 5000) speedEvents.shift()
  const sumBytes = speedEvents.reduce((acc, s) => acc + s.bytes, 0)
  stat.downloadSpeed = speedEvents.length ? sumBytes / 5 : 0
  lastTotalBytes = resTotalBytes
  lastEngineBytes = engineBytesTotal

  // 引擎专有数据
  pollEngine()

  // 图表采样
  push(chartSpeed.value, stat.downloadSpeed)
  push(chartBuffer.value, stat.bufferedAhead)
  push(chartFps.value, stat.fps)
}

function push(arr: number[], v: number) {
  arr.push(isFinite(v) ? v : 0)
  if (arr.length > MAX_POINTS) arr.splice(0, arr.length - MAX_POINTS)
}

/** 增量消费 Resource Timing：只处理新条目并清空浏览器缓冲，避免长播时遍历/内存无限增长 */
function ingestResourceTiming() {
  const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
  for (const e of entries) {
    if (e.startTime < startMark) continue
    if (targetHost && !e.name.includes(targetHost)) continue
    // 跨域无 Timing-Allow-Origin 时 Resource Timing 不暴露大小，用引擎上报的分片字节补齐
    const rafSize = e.transferSize || e.encodedBodySize || e.decodedBodySize || 0
    const size = rafSize || engineBytesByUrl.get(e.name) || 0
    resTotalBytes += size
    netSummary.count++
    netSummary.bytes += size
    netSummary.msSum += e.duration
    netRows.value.unshift({ url: e.name, name: shortUrl(e.name, 90), type: e.initiatorType, size, ms: e.duration })
    if (netRows.value.length > NET_MAX) netRows.value.pop()
  }
  performance.clearResourceTimings()
}

function pollEngine() {
  const extras: { label: string; value: string }[] = []
  if (hlsRef) {
    const hls = hlsRef
    try {
      const lv = hls.levels?.[hls.currentLevel >= 0 ? hls.currentLevel : (hls.loadLevel ?? 0)]
      const live = !!lv?.details?.live
      isLive.value = live
      if (live && typeof hls.latency === 'number' && isFinite(hls.latency)) stat.liveLatency = hls.latency
      if (live && typeof hls.targetLatency === 'number') extras.push({ label: 'targetLatency (hls.js)', value: `${hls.targetLatency.toFixed(2)} s` })
      if (live && typeof hls.liveSyncPosition === 'number') extras.push({ label: 'liveSyncPosition', value: fmtTime(hls.liveSyncPosition) })
      extras.push({ label: 'currentLevel / loadLevel', value: `${hls.currentLevel} / ${hls.loadLevel} / next ${hls.nextLoadLevel}` })
      if (lv?.details) {
        extras.push({ label: '分片数 / 目标时长', value: `${lv.details.fragments?.length ?? '-'} / ${lv.details.targetduration ?? '-'}` })
        if (lv.details.fragments?.length) {
          const f = lv.details.fragments[lv.details.fragments.length - 1]
          extras.push({ label: '最新分片 SN / start', value: `${f.sn} / ${fmtTime(f.start)}` })
        }
        if (lv.details.live) extras.push({ label: '滑动窗口起点 / 末尾', value: `${fmtTime(lv.details.fragments?.[0]?.start)} ~ ${fmtTime(lv.details.fragments?.[lv.details.fragments.length - 1]?.start)}` })
      }
    } catch { /* ignore */ }
    refreshHlsLevels()
  }
  if (flvRef) {
    const si = { ...(flvStatsCache ?? {}), ...(flvRef.statisticsInfo ?? {}) }
    if (typeof si.speed === 'number' && si.speed > 0) stat.downloadSpeed = si.speed * 1024
    if (typeof si.decodedFrames === 'number') stat.decodedFrames = si.decodedFrames
    if (typeof si.droppedFrames === 'number') stat.droppedFrames = si.droppedFrames
    if (!stat.totalFrames) stat.totalFrames = stat.decodedFrames + stat.droppedFrames
    if (si.playerType) extras.push({ label: 'playerType (mpegts.js)', value: si.playerType })
    if (si.loaderType) extras.push({ label: 'loaderType', value: si.loaderType })
    if (typeof si.speed === 'number') extras.push({ label: 'speed (mpegts.js)', value: `${si.speed.toFixed(1)} KB/s` })
    if (typeof si.currentSegmentIndex === 'number') extras.push({ label: 'segmentIndex / total', value: `${si.currentSegmentIndex} / ${si.totalSegmentCount ?? '-'}` })
    if (si.hasRedirect) extras.push({ label: 'redirect →', value: si.redirectedURL ?? 'yes' })
    const mi = flvRef.mediaInfo ?? {}
    if (typeof mi.duration === 'number') media.duration = mi.duration
  }
  if (dashRef) {
    const player = dashRef
    try {
      const dm = player.getDashMetrics?.()
      const dynamic = player.isDynamic?.()
      isLive.value = !!dynamic
      const throughput = player.getAverageThroughput?.('video')
      if (typeof throughput === 'number' && isFinite(throughput) && throughput > 0) {
        stat.abrThroughput = throughput
        extras.push({ label: 'ABR 吞吐估计 (dash.js)', value: fmtBitrate(throughput * 1000) })
      }
      if (dynamic) {
        const latency = player.getCurrentLiveLatency?.()
        if (typeof latency === 'number' && isFinite(latency)) stat.liveLatency = latency
        const target = player.getTargetLiveDelay?.()
        if (typeof target === 'number') extras.push({ label: 'targetLiveDelay (dash.js)', value: `${target.toFixed(2)} s` })
      }
      extras.push({ label: 'isDynamic (DASH)', value: String(dynamic) })
      if (dm) {
        const buf = dm.getCurrentBufferLevel?.('video')
        if (typeof buf === 'number') extras.push({ label: 'bufferLevel (dash metrics)', value: `${buf.toFixed(2)} s` })
        const reqs = dm.getHttpRequests?.('video') ?? []
        if (reqs.length) {
          const last = reqs[reqs.length - 1]
          extras.push({ label: '最近请求', value: `${shortUrl(last.url ?? '', 40)} ${last.bytes ? fmtBytes(last.bytes) : ''}` })
        }
      }
    } catch { /* ignore */ }
    refreshDashLevels()
  }
  engineExtras.value = extras
}

// ---------- 概览卡片 ----------
const statusText = computed(() => ({
  idle: '空闲',
  loading: '加载中',
  playing: '播放中',
  paused: '已暂停',
  buffering: '缓冲中',
  ended: '已结束',
  error: '错误',
} as Record<Status, string>)[status.value])

const overviewCards = computed(() => {
  const dur = isFinite(media.duration) ? media.duration : (videoRef.value?.duration ?? NaN)
  return [
    { label: '状态', value: statusText.value, strong: true },
    { label: '引擎', value: engineName.value ? `${engineName.value} ${engineVer.value}` : '-' },
    { label: '分辨率', value: stat.videoWidth ? `${stat.videoWidth} × ${stat.videoHeight}` : (media.width ? `${media.width} × ${media.height}` : '-') },
    { label: '视频编码', value: media.videoCodec || '-' },
    { label: '音频编码', value: media.audioCodec || '-' },
    { label: '类型', value: isLive.value ? '直播' : (isFinite(dur) ? `点播 ${fmtTime(dur)}` : '未知') },
    { label: '当前时间', value: fmtTime(stat.currentTime) },
    { label: '缓冲余量', value: `${stat.bufferedAhead.toFixed(2)} s` },
    { label: '下载速度', value: fmtSpeed(stat.downloadSpeed) },
    { label: '实时 FPS', value: stat.fps ? stat.fps.toFixed(1) : '-' },
    { label: '解码 / 丢帧', value: `${stat.decodedFrames} / ${stat.droppedFrames}` },
    { label: '直播延迟', value: isLive.value && isFinite(stat.liveLatency) ? `${stat.liveLatency.toFixed(2)} s` : '-' },
  ]
})

// ---------- 媒体信息 ----------
const mediaRows = computed(() => {
  const video = videoRef.value
  const rows: { label: string; value: string }[] = [
    { label: 'mimeType', value: media.mimeType || '-' },
    { label: 'hasVideo', value: media.hasVideo === undefined ? '-' : String(media.hasVideo) },
    { label: 'hasAudio', value: media.hasAudio === undefined ? '-' : String(media.hasAudio) },
    { label: 'videoCodec', value: media.videoCodec || '-' },
    { label: 'audioCodec', value: media.audioCodec || '-' },
    { label: 'chromaFormat', value: media.chroma || '-' },
    { label: '帧率 (metadata)', value: media.fps ? `${media.fps} fps` : '-' },
    { label: '码率 (metadata)', value: media.videoDataRate || media.audioDataRate ? `${fmtBitrate((media.videoDataRate || 0) * 1000)} / ${fmtBitrate((media.audioDataRate || 0) * 1000)}` : '-' },
    { label: 'duration', value: isFinite(media.duration) ? `${fmtTime(media.duration)} (${media.duration.toFixed(3)}s)` : (video && isFinite(video.duration) ? `${fmtTime(video.duration)} (${video.duration.toFixed(3)}s)` : 'Infinity / Live') },
    { label: 'currentTime', value: `${stat.currentTime.toFixed(3)} s` },
    { label: 'playbackRate', value: `${stat.playbackRate}x` },
    { label: '音量 / 静音', value: `${stat.volume.toFixed(2)} / ${stat.videoMuted ? '静音' : '有声'}` },
    { label: 'readyState', value: readyStateName(stat.readyState) },
    { label: 'networkState', value: networkStateName(stat.networkState) },
    { label: 'videoWidth×Height', value: `${stat.videoWidth} × ${stat.videoHeight}` },
    { label: 'seekable 范围', value: stat.seekEnd > 0 ? `${fmtTime(stat.seekStart)} ~ ${fmtTime(stat.seekEnd)}` : '-' },
    { label: 'buffered 区间', value: bufferedRanges.value.length ? bufferedRanges.value.map(r => `[${fmtTime(r.start)} ~ ${fmtTime(r.end)}]`).join(' ') : '-' },
    { label: '缓冲余量 / 尾端', value: `${stat.bufferedAhead.toFixed(2)} s / ${fmtTime(stat.bufferEnd)}` },
    { label: '总帧 / 解码 / 丢帧 / 损坏', value: `${stat.totalFrames} / ${stat.decodedFrames} / ${stat.droppedFrames} / ${stat.corruptedFrames}` },
    { label: '丢帧率', value: stat.totalFrames ? `${((stat.droppedFrames / stat.totalFrames) * 100).toFixed(2)}%` : '-' },
  ]
  return rows
})

// ---------- 环境信息 ----------
function msSupport(mime: string): string {
  try {
    return (window as any).MediaSource?.isTypeSupported?.(mime) ? '✓' : '✗'
  } catch {
    return '?'
  }
}

const envRows = computed(() => {
  const rows = [
    { label: 'UserAgent', value: navigator.userAgent },
    { label: 'MSE (MediaSource)', value: typeof (window as any).MediaSource !== 'undefined' ? '✓ 支持' : '✗ 不支持' },
    {
      label: 'hls.js',
      value: engineLoaded.hls
        ? `✓ 已加载 ${engineVersions.hls}（MSE ${HlsCls?.isSupported?.() ? '✓' : '✗'}）`
        : '未加载（播放 HLS 时按需加载）',
    },
    {
      label: 'mpegts.js',
      value: engineLoaded.flv
        ? `✓ 已加载 ${engineVersions.flv}（MSE ${mpegtsMod?.isSupported?.() ? '✓' : '✗'}）`
        : '未加载（播放 FLV 时按需加载）',
    },
    {
      label: 'dash.js',
      value: engineLoaded.dash ? `✓ 已加载 ${engineVersions.dash}` : '未加载（播放 DASH 时按需加载）',
    },
    { label: 'H.264 (avc1.64001f)', value: msSupport('video/mp4; codecs="avc1.64001f"') },
    { label: 'H.265 (hvc1.1.6.L120.90)', value: msSupport('video/mp4; codecs="hvc1.1.6.L120.90"') },
    { label: 'AV1 (av01.0.08M.08)', value: msSupport('video/mp4; codecs="av01.0.08M.08"') },
    { label: 'AAC (mp4a.40.2)', value: msSupport('video/mp4; codecs="mp4a.40.2"') },
    { label: 'VP9 (vp09.00.10.08)', value: msSupport('video/mp4; codecs="vp09.00.10.08"') },
    { label: 'requestVideoFrameCallback', value: typeof (window as any).requestVideoFrameCallback !== 'undefined' || (HTMLVideoElement.prototype as any).requestVideoFrameCallback ? '✓ 支持' : '✗ 不支持' },
    { label: 'getVideoPlaybackQuality', value: typeof (videoRef.value as any)?.getVideoPlaybackQuality === 'function' || 'getVideoPlaybackQuality' in HTMLVideoElement.prototype ? '✓ 支持' : '✗ 不支持' },
  ]
  if (engineLoaded.flv) {
    const f = mpegtsMod?.getFeatureList?.()
    if (f) rows.push({ label: 'mpegts.js 特性', value: Object.entries(f).map(([k, v]) => `${k}=${v}`).join(', ') })
  }
  return rows
})

// ---------- Tabs ----------
const tab = ref<'env' | 'media' | 'quality' | 'segments' | 'network' | 'logs'>('media')
const tabs = [
  { key: 'media', label: '媒体信息' },
  { key: 'quality', label: '清晰度/轨道' },
  { key: 'segments', label: '分片加载' },
  { key: 'network', label: '网络请求' },
  { key: 'logs', label: '事件日志' },
  { key: 'env', label: '运行环境' },
] as const

function copySegText(): string {
  return segments.value.map(r => `${r.t}\t${r.engine}\t${r.id}\t${fmtBytes(r.size)}\t${r.ms.toFixed(0)}ms\t${fmtBitrate(r.bps)}`).join('\n')
}

function copyNetText(): string {
  return netRows.value.map(r => `${r.name}\t${r.type}\t${r.size ? fmtBytes(r.size) : '-'}\t${r.ms.toFixed(0)}ms`).join('\n')
}
</script>

<template>
  <div>
    <!-- 控制区 -->
    <div class="p-4 rounded-xl bg-bg-card border border-border mb-4">
      <label class="block text-sm text-text-light mb-2">流地址（FLV / HLS m3u8 / DASH mpd）</label>
      <div class="flex gap-2">
        <div ref="urlBoxEl" class="relative flex-1">
          <input
            v-model="url"
            class="w-full px-4 py-2 pr-10 rounded-lg border border-border bg-bg text-text text-sm font-mono focus:outline-none focus:border-primary transition-colors"
            placeholder="https://example.com/live/stream.flv 或 .m3u8 或 .mpd"
            @focus="showDropdown = true; filterActive = false"
            @input="showDropdown = true; filterActive = true"
            @keyup.enter="play"
            @keyup.esc="showDropdown = false"
          />
          <button
            class="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-md bg-transparent border-none cursor-pointer text-text-light hover:bg-border transition-colors"
            @click="showDropdown = !showDropdown; filterActive = false"
          >
            <span class="i-lucide-chevron-down w-4 h-4 transition-transform" :class="showDropdown ? 'rotate-180' : ''" />
          </button>
          <div
            v-if="showDropdown"
            class="absolute z-20 left-0 right-0 top-full mt-1 rounded-xl border border-border bg-bg-card shadow-lg overflow-hidden"
          >
            <div class="px-3 py-2 text-xs text-text-light border-b border-border/50 flex items-center justify-between">
              <span>测试流（点击选择，播放过的流自动保存）</span>
              <button
                v-if="history.length"
                class="text-xs text-text-light hover:text-primary bg-transparent border-none cursor-pointer"
                @click="clearHistory"
              >清空记录</button>
            </div>
            <div class="max-h-64 overflow-y-auto">
              <div
                v-for="item in suggestions"
                :key="item.url"
                class="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-bg/60 transition-colors"
                @click="selectStream(item)"
              >
                <span class="px-1.5 py-0.5 rounded text-[10px] font-mono flex-shrink-0" :class="typeBadgeClass(item.type)">{{ item.type.toUpperCase() }}</span>
                <span class="flex-1 truncate text-xs font-mono text-text" :title="item.url">{{ item.url }}</span>
                <span v-if="!item.builtin" class="text-[10px] text-text-light flex-shrink-0">{{ fmtDateShort(item.time) }}</span>
                <span
                  v-if="!item.builtin"
                  class="w-5 h-5 flex items-center justify-center rounded flex-shrink-0 text-text-light hover:bg-red-100 hover:text-red-500 transition-colors"
                  title="删除记录"
                  @click.stop="removeHistory(item.url)"
                >
                  <span class="i-lucide-x w-3.5 h-3.5" />
                </span>
              </div>
              <div v-if="!suggestions.length" class="px-3 py-4 text-center text-xs text-text-light">无匹配的流地址</div>
            </div>
          </div>
        </div>
        <button class="px-5 py-2 rounded-lg bg-primary text-bg text-sm border-none cursor-pointer hover:opacity-80 transition-opacity" @click="play">播放</button>
        <button class="px-4 py-2 rounded-lg bg-bg text-text text-sm border border-border cursor-pointer hover:border-primary transition-colors" @click="stop()">停止</button>
      </div>
      <div class="flex flex-wrap items-center gap-x-6 gap-y-2 mt-3 text-sm text-text">
        <label class="flex items-center gap-2">
          <span class="text-text-light">流类型</span>
          <select v-model="typeSel" class="px-2 py-1 rounded-md border border-border bg-bg text-text text-sm focus:outline-none focus:border-primary">
            <option value="auto">自动识别</option>
            <option value="flv">FLV (mpegts.js)</option>
            <option value="hls">HLS (hls.js)</option>
            <option value="dash">DASH (dash.js)</option>
          </select>
        </label>
        <label class="flex items-center gap-2">
          <span class="text-text-light">直播模式</span>
          <select v-model="liveMode" class="px-2 py-1 rounded-md border border-border bg-bg text-text text-sm focus:outline-none focus:border-primary">
            <option value="auto">自动</option>
            <option value="live">直播</option>
            <option value="vod">点播</option>
          </select>
        </label>
        <label class="flex items-center gap-2 cursor-pointer">
          <input v-model="autoplay" type="checkbox" class="accent-primary" />
          自动播放
        </label>
        <label class="flex items-center gap-2 cursor-pointer">
          <input v-model="muted" type="checkbox" class="accent-primary" />
          静音
        </label>
        <span class="text-xs text-text-light">快捷键：空格 播放/暂停</span>
      </div>
    </div>

    <div v-if="errorMsg" class="mb-4 px-4 py-3 rounded-lg bg-red-50 text-red-600 text-sm border border-red-200">
      {{ errorMsg }}
    </div>

    <!-- 播放器 -->
    <video
      ref="videoRef"
      controls
      class="w-full aspect-video bg-black mb-4"
    />

    <!-- 概览 -->
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
      <div v-for="card in overviewCards" :key="card.label" class="px-3 py-2.5 rounded-xl bg-bg-card border border-border">
        <div class="text-xs text-text-light">{{ card.label }}</div>
        <div class="text-sm font-semibold font-mono text-text truncate" :title="card.value">{{ card.value }}</div>
      </div>
    </div>

    <!-- 图表 -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
      <MiniChart label="下载速度" color="#69DBF2" :data="chartSpeed" :format-value="fmtSpeed" />
      <MiniChart label="缓冲余量" color="#8ECAE6" :data="chartBuffer" unit="s" />
      <MiniChart label="渲染 FPS" color="#F2A65A" :data="chartFps" unit="fps" />
    </div>

    <!-- Tabs -->
    <div class="flex flex-wrap gap-2 mb-3">
      <button
        v-for="t in tabs"
        :key="t.key"
        class="px-4 py-2 rounded-lg text-sm border-none cursor-pointer transition-colors"
        :class="tab === t.key ? 'bg-primary text-bg' : 'bg-bg-card text-text-light border border-border hover:border-primary'"
        @click="tab = t.key"
      >
        {{ t.label }}
      </button>
    </div>

    <!-- 媒体信息 -->
    <div v-show="tab === 'media'">
      <div class="rounded-xl border border-border overflow-hidden">
        <div class="bg-bg px-4 py-2 text-sm font-medium text-text-light border-b border-border">媒体与播放数据</div>
        <div class="grid grid-cols-1 md:grid-cols-2">
          <div v-for="row in mediaRows" :key="row.label" class="flex items-start px-4 py-2 border-b border-border/50 hover:bg-bg/50 transition-colors">
            <span class="text-sm text-text-light w-52 flex-shrink-0 font-mono">{{ row.label }}</span>
            <span class="text-sm text-text font-mono flex-1 break-all">{{ row.value }}</span>
          </div>
        </div>
      </div>
      <div v-if="engineExtras.length" class="mt-4 rounded-xl border border-border overflow-hidden">
        <div class="bg-bg px-4 py-2 text-sm font-medium text-text-light border-b border-border">引擎专有数据</div>
        <div v-for="row in engineExtras" :key="row.label" class="flex items-start px-4 py-2 border-b border-border/50 last:border-b-0 hover:bg-bg/50 transition-colors">
          <span class="text-sm text-text-light w-52 flex-shrink-0 font-mono">{{ row.label }}</span>
          <span class="text-sm text-text font-mono flex-1 break-all">{{ row.value }}</span>
        </div>
      </div>
    </div>

    <!-- 清晰度 -->
    <div v-show="tab === 'quality'">
      <div class="flex items-center gap-2 mb-3">
        <button
          class="px-3 py-1.5 rounded-lg text-xs border-none cursor-pointer transition-colors"
          :class="autoLevel ? 'bg-primary text-bg' : 'bg-bg-card text-text-light border border-border hover:border-primary'"
          @click="setLevel(-1)"
        >自动 (ABR)</button>
        <span class="text-xs text-text-light">手动锁定后播放器将按所选清晰度拉流</span>
      </div>
      <div class="rounded-xl border border-border overflow-hidden">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-bg text-text-light text-left">
              <th class="px-4 py-2 font-medium">ID</th>
              <th class="px-4 py-2 font-medium">码率</th>
              <th class="px-4 py-2 font-medium">分辨率</th>
              <th class="px-4 py-2 font-medium">编码</th>
              <th class="px-4 py-2 font-medium">状态</th>
              <th class="px-4 py-2 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in levels" :key="row.idx" class="border-t border-border/50 hover:bg-bg/50 transition-colors">
              <td class="px-4 py-2 font-mono text-text">{{ row.label }}</td>
              <td class="px-4 py-2 font-mono text-text">{{ fmtBitrate(row.bitrate) }}</td>
              <td class="px-4 py-2 font-mono text-text">{{ row.width ? `${row.width}×${row.height}` : '-' }}</td>
              <td class="px-4 py-2 font-mono text-text-light break-all">{{ row.codec || '-' }}</td>
              <td class="px-4 py-2">
                <span v-if="row.current" class="px-2 py-0.5 rounded text-xs bg-primary text-bg">当前</span>
                <span v-else class="text-xs text-text-light">-</span>
              </td>
              <td class="px-4 py-2">
                <button
                  class="px-3 py-1 rounded-md text-xs bg-bg text-text border border-border cursor-pointer hover:border-primary transition-colors"
                  @click="setLevel(row.idx)"
                >切换</button>
              </td>
            </tr>
            <tr v-if="!levels.length">
              <td colspan="6" class="px-4 py-6 text-center text-text-light text-sm">暂无清晰度数据（HLS/DASH 多清晰度流会在此列出）</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 分片加载 -->
    <div v-show="tab === 'segments'">
      <div class="flex flex-wrap items-center gap-x-5 gap-y-1 mb-3 text-xs text-text-light">
        <span>累计分片 <b class="text-text font-mono">{{ segSummary.count }}</b></span>
        <span>累计流量 <b class="text-text font-mono">{{ fmtBytes(segSummary.bytes) }}</b></span>
        <span>平均速率 <b class="text-text font-mono">{{ segSummary.count ? fmtBitrate(segSummary.bpsSum / segSummary.count) : '-' }}</b></span>
        <span>平均耗时 <b class="text-text font-mono">{{ segSummary.count ? (segSummary.msSum / segSummary.count).toFixed(0) + ' ms' : '-' }}</b></span>
        <span>仅保留最近 {{ SEG_MAX }} 条（当前 {{ segments.length }} 条）</span>
        <span class="ml-auto"><CopyButton :text="copySegText()" /></span>
      </div>
      <div class="rounded-xl border border-border overflow-hidden">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-bg text-text-light text-left">
              <th class="px-4 py-2 font-medium">时间</th>
              <th class="px-4 py-2 font-medium">引擎</th>
              <th class="px-4 py-2 font-medium">分片</th>
              <th class="px-4 py-2 font-medium">大小</th>
              <th class="px-4 py-2 font-medium">耗时</th>
              <th class="px-4 py-2 font-medium">瞬时速率</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in segVisible" :key="i" class="border-t border-border/50 hover:bg-bg/50 transition-colors">
              <td class="px-4 py-2 font-mono text-text-light">{{ row.t }}</td>
              <td class="px-4 py-2 font-mono text-text">{{ row.engine }}</td>
              <td class="px-4 py-2 font-mono text-text break-all">{{ row.id }}</td>
              <td class="px-4 py-2 font-mono text-text">{{ fmtBytes(row.size) }}</td>
              <td class="px-4 py-2 font-mono text-text">{{ row.ms.toFixed(0) }} ms</td>
              <td class="px-4 py-2 font-mono text-text">{{ fmtBitrate(row.bps) }}</td>
            </tr>
            <tr v-if="!segments.length">
              <td colspan="6" class="px-4 py-6 text-center text-text-light text-sm">暂无分片加载记录</td>
            </tr>
          </tbody>
        </table>
        <div v-if="segments.length > segShown" class="px-4 py-2 text-center border-t border-border/50">
          <button
            class="px-3 py-1 rounded-md text-xs bg-bg text-text border border-border cursor-pointer hover:border-primary transition-colors"
            @click="segShown += PAGE_SIZE"
          >显示更多（已显示 {{ Math.min(segShown, segments.length) }} / {{ segments.length }}）</button>
        </div>
      </div>
    </div>

    <!-- 网络请求 -->
    <div v-show="tab === 'network'">
      <div class="flex flex-wrap items-center gap-x-5 gap-y-1 mb-3 text-xs text-text-light">
        <span>累计请求 <b class="text-text font-mono">{{ netSummary.count }}</b></span>
        <span>累计流量 <b class="text-text font-mono">{{ fmtBytes(netSummary.bytes) }}</b></span>
        <span>平均耗时 <b class="text-text font-mono">{{ netSummary.count ? (netSummary.msSum / netSummary.count).toFixed(0) + ' ms' : '-' }}</b></span>
        <span>仅保留最近 {{ NET_MAX }} 条（当前 {{ netRows.length }} 条）</span>
        <span class="ml-auto"><CopyButton :text="copyNetText()" /></span>
      </div>
      <div class="text-xs text-text-light mb-3">大小优先取 Resource Timing；跨域未带 Timing-Allow-Origin 头时由引擎上报的分片字节补齐，“-”表示无法获得</div>
      <div class="rounded-xl border border-border overflow-hidden">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-bg text-text-light text-left">
              <th class="px-4 py-2 font-medium">资源</th>
              <th class="px-4 py-2 font-medium">发起方</th>
              <th class="px-4 py-2 font-medium">传输大小</th>
              <th class="px-4 py-2 font-medium">耗时</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in netVisible" :key="i" class="border-t border-border/50 hover:bg-bg/50 transition-colors">
              <td class="px-4 py-2 font-mono text-text break-all">{{ row.name }}</td>
              <td class="px-4 py-2 font-mono text-text-light">{{ row.type }}</td>
              <td class="px-4 py-2 font-mono text-text">{{ row.size ? fmtBytes(row.size) : '-' }}</td>
              <td class="px-4 py-2 font-mono text-text">{{ row.ms.toFixed(0) }} ms</td>
            </tr>
            <tr v-if="!netRows.length">
              <td colspan="4" class="px-4 py-6 text-center text-text-light text-sm">暂无网络请求记录</td>
            </tr>
          </tbody>
        </table>
        <div v-if="netRows.length > netShown" class="px-4 py-2 text-center border-t border-border/50">
          <button
            class="px-3 py-1 rounded-md text-xs bg-bg text-text border border-border cursor-pointer hover:border-primary transition-colors"
            @click="netShown += PAGE_SIZE"
          >显示更多（已显示 {{ Math.min(netShown, netRows.length) }} / {{ netRows.length }}）</button>
        </div>
      </div>
    </div>

    <!-- 事件日志 -->
    <div v-show="tab === 'logs'">
      <div class="flex flex-wrap items-center gap-3 mb-3">
        <input
          v-model="logFilter"
          class="px-3 py-1.5 rounded-lg border border-border bg-bg text-text text-sm focus:outline-none focus:border-primary"
          placeholder="过滤日志关键字…"
        />
        <label class="flex items-center gap-2 text-sm text-text-light cursor-pointer">
          <input v-model="autoScroll" type="checkbox" class="accent-primary" />
          自动滚动
        </label>
        <div class="flex items-center gap-2 ml-auto">
          <CopyButton :text="logText" />
          <button
            class="px-3 py-1.5 rounded-lg bg-bg-card text-text-light text-xs border border-border cursor-pointer hover:border-primary transition-colors"
            @click="logs = []"
          >清空</button>
        </div>
      </div>
      <div ref="logsEl" class="rounded-xl border border-border overflow-y-auto bg-bg-card" style="max-height: 480px">
        <div
          v-for="(row, i) in filteredLogs"
          :key="i"
          class="flex items-start gap-3 px-4 py-1.5 border-b border-border/30 last:border-b-0 font-mono text-xs hover:bg-bg/50 transition-colors"
        >
          <span class="text-text-light flex-shrink-0">{{ row.t }}</span>
          <span
            class="px-1.5 rounded flex-shrink-0 text-[10px] leading-5"
            :class="row.level === 'error' ? 'bg-red-100 text-red-600' : row.level === 'warn' ? 'bg-yellow-100 text-yellow-700' : 'bg-border/50 text-text-light'"
          >{{ row.level }}</span>
          <span class="text-primary flex-shrink-0 w-20 truncate">{{ row.tag }}</span>
          <span class="text-text flex-1 break-all">{{ row.msg }}</span>
        </div>
        <div v-if="!filteredLogs.length" class="px-4 py-6 text-center text-text-light text-sm">暂无日志</div>
      </div>
    </div>

    <!-- 运行环境 -->
    <div v-show="tab === 'env'">
      <div class="rounded-xl border border-border overflow-hidden">
        <div class="bg-bg px-4 py-2 text-sm font-medium text-text-light border-b border-border">浏览器与解码能力</div>
        <div v-for="row in envRows" :key="row.label" class="flex items-start px-4 py-2 border-b border-border/50 last:border-b-0 hover:bg-bg/50 transition-colors">
          <span class="text-sm text-text-light w-52 flex-shrink-0 font-mono">{{ row.label }}</span>
          <span class="text-sm text-text font-mono flex-1 break-all">{{ row.value }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

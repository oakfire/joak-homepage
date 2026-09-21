<script setup lang="ts">
import { ref, computed } from 'vue'
import CopyButton from '../../components/CopyButton.vue'

type Algorithm = 'CRC32' | 'MD5' | 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'

const algorithms: Algorithm[] = ['CRC32', 'MD5', 'SHA-1', 'SHA-256', 'SHA-384', 'SHA-512']
const selectedAlgos = ref<Set<Algorithm>>(new Set(['SHA-256']))

const mode = ref<'file' | 'text'>('file')
const file = ref<File | null>(null)
const textInput = ref('')
const isDragging = ref(false)
const isComputing = ref(false)
const progress = ref(0)
const results = ref<Map<Algorithm, string>>(new Map())
const error = ref('')
const fileSize = ref('')
const fileName = ref('')
const elapsedTime = ref(0)
const uppercase = ref(false)
let timer: ReturnType<typeof setInterval> | null = null

const CHUNK_SIZE = 4 * 1024 * 1024 // 4MB

function formatSize(bytes: number): string {
  return bytes.toLocaleString() + ' B'
}

function toggleAlgo(algo: Algorithm) {
  if (selectedAlgos.value.has(algo)) {
    if (selectedAlgos.value.size > 1) {
      selectedAlgos.value.delete(algo)
      selectedAlgos.value = new Set(selectedAlgos.value)
    }
  } else {
    selectedAlgos.value.add(algo)
    selectedAlgos.value = new Set(selectedAlgos.value)
  }
}

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

function selectFile(f: File) {
  file.value = f
  fileName.value = f.name
  fileSize.value = formatSize(f.size)
  results.value = new Map()
  error.value = ''
  progress.value = 0
}

function reset() {
  file.value = null
  fileName.value = ''
  fileSize.value = ''
  textInput.value = ''
  results.value = new Map()
  error.value = ''
  progress.value = 0
  isComputing.value = false
  elapsedTime.value = 0
  if (timer) { clearInterval(timer); timer = null }
}

async function computeHash() {
  if (mode.value === 'file' && !file.value) return
  if (mode.value === 'text' && !textInput.value) return

  isComputing.value = true
  progress.value = 0
  results.value = new Map()
  error.value = ''
  elapsedTime.value = 0

  timer = setInterval(() => { elapsedTime.value++ }, 1000)

  try {
    const algos = Array.from(selectedAlgos.value)

    if (mode.value === 'text') {
      const encoder = new TextEncoder()
      const data = encoder.encode(textInput.value)
      progress.value = 100
      await computeHashForData(algos, data)
    } else {
      const f = file.value!
      const totalChunks = Math.ceil(f.size / CHUNK_SIZE)
      let loaded = 0

      const needMD5 = algos.includes('MD5')
      const needCRC32 = algos.includes('CRC32')
      const shaAlgos = algos.filter(a => a !== 'MD5' && a !== 'CRC32')

      const md5 = needMD5 ? new MD5() : null
      const crc32 = needCRC32 ? new CRC32() : null
      const shaHashers = shaAlgos.map(algo => ({ algo, hasher: new IncrementalSHA(algo) }))

      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE
        const end = Math.min(start + CHUNK_SIZE, f.size)
        const chunk = await f.slice(start, end).arrayBuffer()
        const data = new Uint8Array(chunk)

        md5?.update(data)
        crc32?.update(data)
        for (const h of shaHashers) h.hasher.update(data)

        loaded += end - start
        progress.value = Math.round((loaded / f.size) * 100)
      }

      if (crc32) results.value = new Map(results.value.set('CRC32', crc32.hexDigest()))
      if (md5) results.value = new Map(results.value.set('MD5', md5.hexDigest()))
      for (const h of shaHashers) {
        const hash = await h.hasher.digest()
        results.value = new Map(results.value.set(h.algo, hash))
      }
    }
  } catch (e: any) {
    error.value = e.message || '计算失败'
  } finally {
    isComputing.value = false
    if (timer) { clearInterval(timer); timer = null }
  }
}

function bufferToHex(buffer: Uint8Array): string {
  const hex = new Array(buffer.length)
  for (let i = 0; i < buffer.length; i++) hex[i] = buffer[i].toString(16).padStart(2, '0')
  return hex.join('')
}

async function computeHashForData(algos: Algorithm[], data: Uint8Array) {
  const needMD5 = algos.includes('MD5')
  const needCRC32 = algos.includes('CRC32')
  const shaAlgos = algos.filter(a => a !== 'MD5' && a !== 'CRC32')

  if (needCRC32) {
    const crc32 = new CRC32()
    crc32.update(data)
    results.value = new Map(results.value.set('CRC32', crc32.hexDigest()))
  }

  if (needMD5) {
    const md5 = new MD5()
    md5.update(data)
    results.value = new Map(results.value.set('MD5', md5.hexDigest()))
  }

  for (const algo of shaAlgos) {
    const hasher = new IncrementalSHA(algo)
    hasher.update(data)
    const hash = await hasher.digest()
    results.value = new Map(results.value.set(algo, hash))
  }
}

// Incremental SHA using SubtleCrypto via chunk concatenation
class IncrementalSHA {
  private chunks: Uint8Array[] = []
  private totalLen = 0
  private algo: string

  constructor(algo: string) {
    this.algo = algo
  }

  update(data: Uint8Array) {
    this.chunks.push(data)
    this.totalLen += data.length
  }

  async digest(): Promise<string> {
    const buf = new Uint8Array(this.totalLen)
    let offset = 0
    for (const chunk of this.chunks) {
      buf.set(chunk, offset)
      offset += chunk.length
    }
    const hash = await crypto.subtle.digest(this.algo, buf)
    return bufferToHex(new Uint8Array(hash))
  }
}

// CRC32 with precomputed lookup table
class CRC32 {
  private crc = 0xFFFFFFFF
  private static table: Uint32Array | null = null

  private static getTable(): Uint32Array {
    if (!CRC32.table) {
      const table = new Uint32Array(256)
      for (let i = 0; i < 256; i++) {
        let c = i
        for (let j = 0; j < 8; j++) {
          c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
        }
        table[i] = c
      }
      CRC32.table = table
    }
    return CRC32.table
  }

  update(data: Uint8Array) {
    const table = CRC32.getTable()
    let crc = this.crc
    for (let i = 0; i < data.length; i++) {
      crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8)
    }
    this.crc = crc
  }

  hexDigest(): string {
    const n = (this.crc ^ 0xFFFFFFFF) >>> 0
    return n.toString(16).padStart(8, '0')
  }
}

// Optimized MD5 with fixed-size internal buffer
class MD5 {
  private a = 0x67452301
  private b = 0xefcdab89
  private c = 0x98badcfe
  private d = 0x10325476
  private buf = new Uint8Array(64)
  private bufLen = 0
  private totalLen = 0
  private M = new Int32Array(16)

  private static K = new Int32Array([
    -680876936, -389564586, 606105819, -1044525330, -176418897, 1200080426,
    -1473231341, -45705983, 1770035416, -1958414417, -42063, -1990404162,
    1804603682, -40341101, -1502002290, 1236535329, -165796510, -1069501632,
    643717713, -373897302, -701558691, 38016083, -660478335, -405537848,
    568446438, -1019803690, -187363961, 1163531501, -1444681467, -51403784,
    1735328473, -1926607734, -378558, -2022574463, 1839030562, -35309556,
    -1530992060, 1272893353, -155497632, -1094730640, 681279174, -358537222,
    -722521979, 76029189, -640364487, -421815835, 530742520, -995338651,
    -198630844, 1126891415, -1416354905, -57434055, 1700485571, -1894986606,
    -1051523, -2054922799, 1873313359, -30611744, -1560198380, 1309151649,
    -145523070, -1120210379, 718787259, -343485551
  ])

  private static S1 = new Uint8Array([7, 12, 17, 22])
  private static S2 = new Uint8Array([5, 9, 14, 20])
  private static S3 = new Uint8Array([4, 11, 16, 23])
  private static S4 = new Uint8Array([6, 10, 15, 21])

  update(data: Uint8Array) {
    let offset = 0
    this.totalLen += data.length

    if (this.bufLen > 0) {
      const need = 64 - this.bufLen
      const take = Math.min(need, data.length)
      this.buf.set(data.subarray(0, take), this.bufLen)
      this.bufLen += take
      offset += take

      if (this.bufLen === 64) {
        this.transform(this.buf)
        this.bufLen = 0
      }
    }

    while (offset + 64 <= data.length) {
      this.transform(data.subarray(offset, offset + 64))
      offset += 64
    }

    if (offset < data.length) {
      const remaining = data.length - offset
      this.buf.set(data.subarray(offset), this.bufLen)
      this.bufLen += remaining
    }
  }

  private transform(block: Uint8Array) {
    const M = this.M
    for (let j = 0; j < 16; j++) {
      M[j] = block[j * 4] | (block[j * 4 + 1] << 8) | (block[j * 4 + 2] << 16) | (block[j * 4 + 3] << 24)
    }

    let a = this.a, b = this.b, c = this.c, d = this.d
    const K = MD5.K

    // Round 1
    const S1 = MD5.S1
    for (let i = 0; i < 16; i++) {
      const f = (b & c) | (~b & d)
      const sum = (a + f + K[i] + M[i]) | 0
      const s = S1[i & 3]
      a = d; d = c; c = b
      b = (b + ((sum << s) | (sum >>> (32 - s)))) | 0
    }

    // Round 2
    const S2 = MD5.S2
    for (let i = 0; i < 16; i++) {
      const f = (d & b) | (~d & c)
      const gi = (5 * i + 1) & 15
      const sum = (a + f + K[16 + i] + M[gi]) | 0
      const s = S2[i & 3]
      a = d; d = c; c = b
      b = (b + ((sum << s) | (sum >>> (32 - s)))) | 0
    }

    // Round 3
    const S3 = MD5.S3
    for (let i = 0; i < 16; i++) {
      const f = b ^ c ^ d
      const gi = (3 * i + 5) & 15
      const sum = (a + f + K[32 + i] + M[gi]) | 0
      const s = S3[i & 3]
      a = d; d = c; c = b
      b = (b + ((sum << s) | (sum >>> (32 - s)))) | 0
    }

    // Round 4
    const S4 = MD5.S4
    for (let i = 0; i < 16; i++) {
      const f = c ^ (b | ~d)
      const gi = (7 * i) & 15
      const sum = (a + f + K[48 + i] + M[gi]) | 0
      const s = S4[i & 3]
      a = d; d = c; c = b
      b = (b + ((sum << s) | (sum >>> (32 - s)))) | 0
    }

    this.a = (this.a + a) | 0
    this.b = (this.b + b) | 0
    this.c = (this.c + c) | 0
    this.d = (this.d + d) | 0
  }

  hexDigest(): string {
    const bitLen = this.totalLen * 8
    const padLen = this.bufLen < 56 ? 56 - this.bufLen : 120 - this.bufLen
    const padding = new Uint8Array(padLen + 8)
    padding[0] = 0x80

    const view = new DataView(padding.buffer)
    view.setUint32(padLen, bitLen & 0xffffffff, true)
    view.setUint32(padLen + 4, (bitLen / 0x100000000) | 0, true)

    this.update(padding.subarray(0, padLen))
    this.update(padding.subarray(padLen))

    const result = new Uint8Array(16)
    const rv = new DataView(result.buffer)
    rv.setInt32(0, this.a, true)
    rv.setInt32(4, this.b, true)
    rv.setInt32(8, this.c, true)
    rv.setInt32(12, this.d, true)

    return bufferToHex(result)
  }
}


const hasResults = computed(() => results.value.size > 0)
const inputSize = computed(() => {
  if (mode.value === 'file') return fileSize.value
  return formatSize(new TextEncoder().encode(textInput.value).length)
})
const elapsedTimeStr = computed(() => {
  const s = elapsedTime.value
  if (s < 60) return `${s}秒`
  const m = Math.floor(s / 60)
  return `${m}分${s % 60}秒`
})
</script>

<template>
  <div class="max-w-2xl">
    <div class="flex rounded-lg overflow-hidden border border-border mb-6">
      <button
        class="flex-1 py-2 text-sm cursor-pointer border-none transition-colors"
        :class="mode === 'file' ? 'bg-primary text-white' : 'bg-bg-card text-text hover:bg-bg'"
        @click="mode = 'file'"
      >文件</button>
      <button
        class="flex-1 py-2 text-sm cursor-pointer border-none border-l border-border transition-colors"
        :class="mode === 'text' ? 'bg-primary text-white' : 'bg-bg-card text-text hover:bg-bg'"
        @click="mode = 'text'"
      >文本</button>
    </div>

    <div v-if="mode === 'file'">
      <div
        class="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors mb-6"
        :class="isDragging ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'"
        @drop="handleDrop"
        @dragover="handleDragOver"
        @dragleave="handleDragLeave"
        @click="($refs.fileInput as HTMLInputElement).click()"
      >
        <div v-if="!file" class="text-text-light">
          <div class="text-4xl mb-3">📁</div>
          <div class="text-lg font-medium mb-1">拖拽文件到此处或点击选择</div>
          <div class="text-sm">支持任意文件</div>
        </div>
        <div v-else class="text-left">
          <div class="flex items-center gap-3 mb-2">
            <span class="text-2xl">📄</span>
            <div class="flex-1 min-w-0">
              <div class="text-text font-medium truncate">{{ fileName }}</div>
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
    </div>

    <div v-else class="mb-6">
      <textarea
        v-model="textInput"
        class="w-full h-40 p-4 rounded-lg border border-border bg-bg-card text-text text-sm resize-y focus:outline-none focus:border-primary transition-colors"
        placeholder="输入或粘贴要计算哈希的文本"
      />
    </div>

    <div class="mb-6">
      <label class="block text-sm text-text-light mb-3">选择哈希算法（可多选）</label>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="algo in algorithms"
          :key="algo"
          class="px-4 py-2 rounded-lg text-sm border-none cursor-pointer transition-colors"
          :class="selectedAlgos.has(algo) ? 'bg-primary text-white' : 'bg-bg-card text-text border border-border'"
          @click="toggleAlgo(algo)"
        >{{ algo }}</button>
      </div>
    </div>

    <button
      class="w-full py-3 rounded-lg text-sm font-medium border-none cursor-pointer transition-colors mb-6"
      :class="(mode === 'file' ? file : textInput) && !isComputing ? 'bg-primary text-white hover:bg-primary-dark' : 'bg-bg-card text-text-light border border-border cursor-not-allowed'"
      :disabled="(mode === 'file' ? !file : !textInput) || isComputing"
      @click="computeHash"
    >
      {{ isComputing ? '计算中...' : '开始计算' }}
    </button>

    <div v-if="isComputing" class="mb-6">
      <div class="flex justify-between text-sm text-text-light mb-2">
        <span>进度</span>
        <span>{{ progress }}% · {{ elapsedTimeStr }}</span>
      </div>
      <div class="h-2 bg-bg-card rounded-full overflow-hidden border border-border">
        <div
          class="h-full bg-primary transition-all duration-200 rounded-full"
          :style="{ width: progress + '%' }"
        />
      </div>
    </div>

    <div v-if="error" class="mb-6 px-4 py-3 rounded-lg bg-red-50 text-red-600 text-sm border border-red-200">
      {{ error }}
    </div>

    <div v-if="hasResults" class="space-y-3">
      <div class="flex items-center justify-between mb-2">
        <div class="text-sm text-text-light">
          计算结果
          <span class="ml-2 text-text font-mono">{{ inputSize }}</span>
        </div>
        <div class="flex rounded-lg overflow-hidden border border-border">
          <button
            class="px-3 py-1 text-xs cursor-pointer border-none transition-colors"
            :class="!uppercase ? 'bg-primary text-white' : 'bg-bg-card text-text hover:bg-bg'"
            @click="uppercase = false"
          >abc</button>
          <button
            class="px-3 py-1 text-xs cursor-pointer border-none border-l border-border transition-colors"
            :class="uppercase ? 'bg-primary text-white' : 'bg-bg-card text-text hover:bg-bg'"
            @click="uppercase = true"
          >ABC</button>
        </div>
      </div>
      <div class="rounded-xl border border-border overflow-hidden">
        <div
          v-for="[algo, hash] in results"
          :key="algo"
          class="flex items-center gap-4 px-4 py-3 border-b border-border last:border-b-0"
        >
          <span class="text-xs font-semibold text-primary uppercase tracking-wider w-20 shrink-0">{{ algo }}</span>
          <code class="flex-1 font-mono text-sm text-text break-all select-all">{{ uppercase ? hash.toUpperCase() : hash }}</code>
          <CopyButton :text="uppercase ? hash.toUpperCase() : hash" />
        </div>
      </div>
    </div>
  </div>
</template>

class BitReader {
  private data: Uint8Array
  private bitPos = 0

  constructor(data: Uint8Array) {
    this.data = data
  }

  readBits(n: number): number {
    let val = 0
    for (let i = 0; i < n; i++) {
      const byteIdx = this.bitPos >> 3
      const bitIdx = 7 - (this.bitPos & 7)
      if (byteIdx < this.data.length) {
        val = (val << 1) | ((this.data[byteIdx] >> bitIdx) & 1)
      }
      this.bitPos++
    }
    return val
  }

  readFlag(): boolean {
    return this.readBits(1) === 1
  }

  readUE(): number {
    let leadingZeros = 0
    while (!this.readBits(1) && leadingZeros < 32) {
      leadingZeros++
    }
    if (leadingZeros === 0) return 0
    const suffix = this.readBits(leadingZeros)
    return (1 << leadingZeros) - 1 + suffix
  }

  readSE(): number {
    const code = this.readUE()
    if (code & 1) return (code + 1) >> 1
    return -(code >> 1)
  }

  moreRBSPData(): boolean {
    const byteIdx = this.bitPos >> 3
    if (byteIdx >= this.data.length) return false
    const bitIdx = 7 - (this.bitPos & 7)
    const remaining = this.data.length * 8 - this.bitPos
    if (remaining <= 0) return false
    const mask = ~((1 << bitIdx) - 1) & 0xff
    if ((this.data[byteIdx] & mask) !== 0) return true
    for (let i = byteIdx + 1; i < this.data.length; i++) {
      if (this.data[i] !== 0) return true
    }
    return false
  }
}

const PROFILE_NAMES: Record<number, string> = {
  66: 'Baseline',
  77: 'Main',
  88: 'Extended',
  100: 'High',
  110: 'High 10',
  122: 'High 4:2:2',
  244: 'High 4:4:4 Predictive',
  44: 'CAVLC 4:4:4 Intra',
  83: 'Scalable Baseline',
  86: 'Scalable High',
  118: 'Multiview High',
  128: 'Stereo High',
}

const NALU_TYPE_NAMES: Record<number, string> = {
  1: 'Non-IDR Slice',
  2: 'Slice Part A',
  3: 'Slice Part B',
  4: 'Slice Part C',
  5: 'IDR Slice',
  6: 'SEI',
  7: 'SPS',
  8: 'PPS',
  9: 'AUD',
  10: 'EOS',
  11: 'EOB',
  12: 'Filler',
}

const CHROMA_FORMAT: Record<number, string> = {
  0: 'Monochrome',
  1: '4:2:0',
  2: '4:2:2',
  3: '4:4:4',
}

export interface SPSResult {
  nalu: {
    forbidden: number
    refIdc: number
    unitType: number
    unitTypeName: string
  }
  profile: number
  profileName: string
  compatibility: number
  level: number
  spsId: number
  chromaFormatIdc?: number
  chromaFormatName?: string
  separateColourPlane?: boolean
  bitDepthLuma?: number
  bitDepthChroma?: number
  qpprimeYZeroTransformBypass?: boolean
  scalingMatrixPresent?: boolean
  log2MaxFrameNum: number
  picOrderCntType?: number
  log2MaxPicOrderCntLsb?: number
  deltaPicOrderAlwaysZero?: boolean
  offsetForNonRefPic?: number
  offsetForTopToBottom?: number
  numRefFramesInPicOrderCntCycle?: number
  maxNumRefFrames: number
  gapsInFrameNumAllowed: boolean
  frameMbsOnly: boolean
  direct8x8Inference: boolean
  width: number
  height: number
  widthMbs: number
  heightMbs: number
  frameCropping: boolean
  cropLeft?: number
  cropRight?: number
  cropTop?: number
  cropBottom?: number
  vuiPresent: boolean
}

export function parseHex(hex: string): Uint8Array {
  const cleaned = hex.replace(/[\s,:\-]/g, '')
  const match = cleaned.match(/^(?:00{2,}01)?(.+)$/)
  const raw = match ? match[1] : cleaned
  if (raw.length % 2 !== 0) throw new Error('Hex 长度必须为偶数')
  const bytes = new Uint8Array(raw.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(raw.substring(i * 2, i * 2 + 2), 16)
    if (isNaN(bytes[i])) throw new Error(`无效的十六进制字符`)
  }
  return bytes
}

function scalingList(reader: BitReader, size: number) {
  let lastScale = 8
  let nextScale = 8
  for (let j = 0; j < size; j++) {
    if (nextScale !== 0) {
      const delta = reader.readSE()
      nextScale = (lastScale + delta + 256) % 256
    }
    lastScale = nextScale === 0 ? lastScale : nextScale
  }
}

export function parseSPS(data: Uint8Array): SPSResult {
  if (data.length < 4) throw new Error('数据太短，不是有效的 SPS')

  const reader = new BitReader(data)

  const forbidden = reader.readBits(1)
  const refIdc = reader.readBits(2)
  const unitType = reader.readBits(5)
  const unitTypeName = NALU_TYPE_NAMES[unitType] || 'Unknown'

  if (unitType !== 7) {
    throw new Error(`NALU type = ${unitType} (${unitTypeName})，不是 SPS (type 7)`)
  }

  const profile = reader.readBits(8)
  const profileName = PROFILE_NAMES[profile] || `Unknown (${profile})`
  const compatibility = reader.readBits(8)
  const level = reader.readBits(8)
  const spsId = reader.readUE()

  if (spsId > 31) throw new Error(`seq_parameter_set_id = ${spsId}，超出范围 (0~31)`)

  let chromaFormatIdc: number | undefined
  let chromaFormatName: string | undefined
  let separateColourPlane: boolean | undefined
  let bitDepthLuma: number | undefined
  let bitDepthChroma: number | undefined
  let qpprimeYZeroTransformBypass: boolean | undefined
  let scalingMatrixPresent: boolean | undefined

  const highProfiles = [100, 110, 122, 244, 44, 83, 86, 118, 128]
  if (highProfiles.includes(profile)) {
    chromaFormatIdc = reader.readUE()
    chromaFormatName = CHROMA_FORMAT[chromaFormatIdc] || `Unknown (${chromaFormatIdc})`
    if (chromaFormatIdc === 3) {
      separateColourPlane = reader.readFlag()
    }
    bitDepthLuma = reader.readUE() + 8
    bitDepthChroma = reader.readUE() + 8
    qpprimeYZeroTransformBypass = reader.readFlag()
    scalingMatrixPresent = reader.readFlag()
    if (scalingMatrixPresent) {
      const count = chromaFormatIdc !== 3 ? 8 : 12
      for (let i = 0; i < count; i++) {
        if (reader.readFlag()) {
          scalingList(reader, i < 6 ? 16 : 64)
        }
      }
    }
  }

  const log2MaxFrameNum = reader.readUE() + 4
  const picOrderCntType = reader.readUE()

  let log2MaxPicOrderCntLsb: number | undefined
  let deltaPicOrderAlwaysZero: boolean | undefined
  let offsetForNonRefPic: number | undefined
  let offsetForTopToBottom: number | undefined
  let numRefFramesInPicOrderCntCycle: number | undefined

  if (picOrderCntType === 0) {
    log2MaxPicOrderCntLsb = reader.readUE() + 4
  } else if (picOrderCntType === 1) {
    deltaPicOrderAlwaysZero = reader.readFlag()
    offsetForNonRefPic = reader.readSE()
    offsetForTopToBottom = reader.readSE()
    numRefFramesInPicOrderCntCycle = reader.readUE()
    for (let i = 0; i < numRefFramesInPicOrderCntCycle; i++) {
      reader.readSE()
    }
  }

  const maxNumRefFrames = reader.readUE()
  const gapsInFrameNumAllowed = reader.readFlag()

  const widthMbs = reader.readUE() + 1
  const heightMbs = reader.readUE() + 1

  const frameMbsOnly = reader.readFlag()
  if (!frameMbsOnly) {
    reader.readFlag() // mb_adaptive_frame_field_flag
  }

  const direct8x8Inference = reader.readFlag()

  const frameCropping = reader.readFlag()

  let cropLeft: number | undefined, cropRight: number | undefined
  let cropTop: number | undefined, cropBottom: number | undefined

  if (frameCropping) {
    cropLeft = reader.readUE()
    cropRight = reader.readUE()
    cropTop = reader.readUE()
    cropBottom = reader.readUE()
  }

  const vuiPresent = reader.readFlag()

  let width = widthMbs * 16
  let height = heightMbs * 16
  if (frameCropping) {
    const cropUnitX = (chromaFormatIdc === 0 || chromaFormatIdc === 3) ? 1 : 2
    const cropUnitY = (chromaFormatIdc === 0 || chromaFormatIdc === 2 || chromaFormatIdc === 3) ? 1 : 2
    width -= (cropLeft! + cropRight!) * cropUnitX
    height -= (cropTop! + cropBottom!) * cropUnitY
  }

  return {
    nalu: { forbidden, refIdc, unitType, unitTypeName },
    profile, profileName, compatibility, level, spsId,
    chromaFormatIdc, chromaFormatName, separateColourPlane,
    bitDepthLuma, bitDepthChroma, qpprimeYZeroTransformBypass, scalingMatrixPresent,
    log2MaxFrameNum, picOrderCntType, log2MaxPicOrderCntLsb,
    deltaPicOrderAlwaysZero, offsetForNonRefPic, offsetForTopToBottom,
    numRefFramesInPicOrderCntCycle,     maxNumRefFrames, gapsInFrameNumAllowed, frameMbsOnly, direct8x8Inference,
    width, height, widthMbs, heightMbs,
    frameCropping, cropLeft, cropRight, cropTop, cropBottom,
    vuiPresent,
  }
}

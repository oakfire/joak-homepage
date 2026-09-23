export interface Field {
  label: string
  value: string | number | boolean
  note?: string
}

export interface FileReport {
  summary: string
  format: string
  mime: string
  category: 'executable' | 'library' | 'object' | 'image' | 'archive' | 'document' | 'media' | 'script' | 'text' | 'data' | 'empty'
  platform: string | null
  fields: Field[]
}

const HEADER_SIZE = 256 * 1024

interface Region {
  start: number
  data: Uint8Array
}

class View {
  private regions: Region[]

  constructor(regions: Region[]) {
    this.regions = [...regions].sort((a, b) => a.start - b.start)
  }

  static from(buf: Uint8Array): View {
    return new View([{ start: 0, data: buf }])
  }

  u8(off: number): number {
    for (const r of this.regions) {
      const i = off - r.start
      if (i >= 0 && i < r.data.length) return r.data[i]
    }
    return 0
  }

  u16(off: number, le: boolean): number {
    return le ? this.u8(off) | (this.u8(off + 1) << 8) : (this.u8(off) << 8) | this.u8(off + 1)
  }

  u32(off: number, le: boolean): number {
    return le
      ? (this.u8(off) | (this.u8(off + 1) << 8) | (this.u8(off + 2) << 16) | (this.u8(off + 3) << 24)) >>> 0
      : ((this.u8(off) << 24) | (this.u8(off + 1) << 16) | (this.u8(off + 2) << 8) | this.u8(off + 3)) >>> 0
  }

  u64Low(off: number, le: boolean): number {
    return this.u32(off, le)
  }

  cstr(off: number, max = 256): string {
    let s = ''
    for (let i = 0; i < max; i++) {
      const c = this.u8(off + i)
      if (c === 0) break
      s += c >= 0x20 && c < 0x7f ? String.fromCharCode(c) : ''
    }
    return s
  }

  has(off: number, len: number): boolean {
    for (const r of this.regions) {
      const i = off - r.start
      if (i >= 0 && i + len <= r.data.length) return true
    }
    return false
  }

  startsWith(bytes: number[], offset = 0): boolean {
    for (let i = 0; i < bytes.length; i++) {
      if (this.u8(offset + i) !== bytes[i]) return false
    }
    return bytes.length > 0
  }

  bytes(off: number, len: number): Uint8Array {
    const out = new Uint8Array(len)
    for (const r of this.regions) {
      const i = off - r.start
      if (i < 0 || i >= r.data.length) continue
      const take = Math.min(len, r.data.length - i)
      out.set(r.data.subarray(i, i + take), 0)
      break
    }
    return out
  }

  head(limit = HEADER_SIZE): Uint8Array {
    for (const r of this.regions) {
      if (r.start === 0) return r.data.subarray(0, Math.min(r.data.length, limit))
    }
    return new Uint8Array(0)
  }
}

async function readRange(file: File, start: number, length: number): Promise<Uint8Array> {
  const end = Math.min(start + length, file.size)
  if (start >= file.size || end <= start) return new Uint8Array(0)
  return new Uint8Array(await file.slice(start, end).arrayBuffer())
}

function emptyReport(): FileReport {
  return {
    summary: 'empty',
    format: 'empty',
    mime: 'application/x-empty',
    category: 'empty',
    platform: null,
    fields: [{ label: '文件大小', value: '0 B' }],
  }
}

export async function inspectFile(file: File): Promise<FileReport> {
  if (file.size === 0) return emptyReport()

  const head = await readRange(file, 0, Math.min(file.size, HEADER_SIZE))
  const regions: Region[] = [{ start: 0, data: head }]

  if (head.length >= 64 && head[0] === 0x7f && head[1] === 0x45 && head[2] === 0x4c && head[3] === 0x46) {
    const extras = await loadElfExtraRegions(file, head)
    regions.push(...extras)
  } else if (
    (head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) ||
    (head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x05 && head[3] === 0x06)
  ) {
    const extras = await loadZipExtraRegions(file, head)
    regions.push(...extras)
  }

  return inspectView(new View(regions), file.size, file.name)
}

export function inspectBytes(head: Uint8Array, fileSize: number, fileName = ''): FileReport {
  if (fileSize === 0) return emptyReport()
  return inspectView(View.from(head), fileSize, fileName)
}

async function loadZipExtraRegions(file: File, head: Uint8Array): Promise<Region[]> {
  const out: Region[] = []
  const tailLen = Math.min(file.size, 65557)
  const tailStart = file.size - tailLen
  const tail = await readRange(file, tailStart, tailLen)
  if (!tail.length) return out

  if (tailStart >= head.length) {
    out.push({ start: tailStart, data: tail })
  } else if (tailStart + tail.length > head.length) {
    const skip = head.length - tailStart
    out.push({ start: head.length, data: tail.subarray(skip) })
  }

  let eocdRel = -1
  for (let i = tail.length - 22; i >= 0; i--) {
    if (tail[i] === 0x50 && tail[i + 1] === 0x4b && tail[i + 2] === 0x05 && tail[i + 3] === 0x06) {
      eocdRel = i
      break
    }
  }
  if (eocdRel < 0) return out

  const tv = new DataView(tail.buffer, tail.byteOffset, tail.length)
  const cdSize = tv.getUint32(eocdRel + 12, true)
  const cdOff = tv.getUint32(eocdRel + 16, true)
  if (cdSize === 0 || cdSize > 16 * 1024 * 1024 || cdOff + cdSize > file.size) return out

  const cdEnd = cdOff + cdSize
  const coveredByHead = cdEnd <= head.length
  const coveredByTail = cdOff >= tailStart && cdEnd <= tailStart + tail.length
  if (!coveredByHead && !coveredByTail) {
    const cd = await readRange(file, cdOff, cdSize)
    if (cd.length) out.push({ start: cdOff, data: cd })
  }
  return out
}

async function loadElfExtraRegions(file: File, head: Uint8Array): Promise<Region[]> {
  const out: Region[] = []
  const view = View.from(head)
  const le = view.u8(5) === 1
  const is64 = view.u8(4) === 2

  const ePhoff = is64 ? view.u64Low(32, le) : view.u32(28, le)
  const eShoff = is64 ? view.u64Low(40, le) : view.u32(32, le)
  const ePhentsize = view.u16(is64 ? 54 : 42, le) || (is64 ? 56 : 32)
  const ePhnum = view.u16(is64 ? 56 : 44, le)
  const eShentsize = view.u16(is64 ? 58 : 46, le) || (is64 ? 64 : 40)
  const eShnum = view.u16(is64 ? 60 : 48, le)

  const phdrs = parseElfPhdrs(view, le, is64, ePhoff, ePhentsize, ePhnum)

  const dyn = phdrs.find(p => p.type === PT_DYNAMIC)
  if (dyn && dyn.filesz > 0 && dyn.offset + Math.min(dyn.filesz, 4096) > head.length) {
    const data = await readRange(file, dyn.offset, Math.min(dyn.filesz, 65536))
    if (data.length) out.push({ start: dyn.offset, data })
  }

  if (eShoff > 0 && eShnum > 0 && eShoff >= head.length) {
    const data = await readRange(file, eShoff, eShnum * eShentsize)
    if (data.length) out.push({ start: eShoff, data })
  }

  const merged = new View([{ start: 0, data: head }, ...out])

  const dynInfo = parseDynamic(merged, le, is64, phdrs)
  if (dynInfo.strtabOff >= 0) {
    const strEnd = dynInfo.strtabOff + Math.max(dynInfo.strtabSize, 1)
    const covered = out.some(r => dynInfo.strtabOff >= r.start && strEnd <= r.start + r.data.length)
      || (dynInfo.strtabOff < head.length && strEnd <= head.length)
    if (!covered) {
      const data = await readRange(file, dynInfo.strtabOff, Math.max(dynInfo.strtabSize, 64 * 1024))
      if (data.length) out.push({ start: dynInfo.strtabOff, data })
    }
  }

  const shStr = peekShstrtab(merged, le, is64, eShoff, eShentsize, eShnum, view.u16(is64 ? 62 : 50, le))
  if (shStr.off >= 0 && shStr.off >= head.length && !out.some(r => shStr.off >= r.start && shStr.off < r.start + r.data.length)) {
    const data = await readRange(file, shStr.off, Math.max(shStr.size, 4096))
    if (data.length) out.push({ start: shStr.off, data })
  }

  return out
}

function inspectView(view: View, fileSize: number, fileName = ''): FileReport {
  const head = view.head()
  const isZip =
    startsWith(head, [0x50, 0x4b, 0x03, 0x04]) || startsWith(head, [0x50, 0x4b, 0x05, 0x06])
  const zipInfo = isZip ? collectZipNames(view, fileSize) : null

  const detected =
    tryParseElf(view) ??
    tryParsePe(head, fileSize) ??
    tryParseMachO(head) ??
    tryParseJavaOrFat(head, fileSize) ??
    tryParseWasm(head) ??
    tryParseImages(head) ??
    tryParseCrx(head) ??
    tryParseArchives(head, zipInfo) ??
    tryParseMedia(head) ??
    tryParseDocuments(head) ??
    tryParseOther(head)

  if (detected) return finalize(detected, fileSize)

  const text = detectText(head, fileSize)
  if (text) return finalize(text, fileSize)

  return {
    summary: 'data',
    format: 'data',
    mime: 'application/octet-stream',
    category: 'data',
    platform: null,
    fields: [
      { label: '文件大小', value: formatSize(fileSize) },
      { label: '文件名', value: fileName || '-' },
    ],
  }
}

interface PartialReport {
  summary: string
  format: string
  mime: string
  category: FileReport['category']
  platform: string | null
  fields: Field[]
}

function finalize(r: PartialReport, fileSize: number): FileReport {
  const fields = [...r.fields]
  if (!fields.some(f => f.label === '文件大小')) {
    fields.push({ label: '文件大小', value: formatSize(fileSize) })
  }
  return { ...r, fields }
}

function formatSize(bytes: number): string {
  return bytes.toLocaleString() + ' B'
}

function hexLower(n: number, width = 0): string {
  const s = n.toString(16).toLowerCase()
  return width ? s.padStart(width, '0') : s
}

function hex(n: number, width = 0): string {
  const s = n.toString(16).toUpperCase()
  return width ? s.padStart(width, '0') : s
}

function ascii(buf: Uint8Array, start: number, len: number): string {
  let s = ''
  for (let i = start; i < start + len && i < buf.length; i++) {
    const c = buf[i]
    s += c >= 0x20 && c < 0x7f ? String.fromCharCode(c) : ''
  }
  return s
}

function startsWith(buf: Uint8Array, bytes: number[], offset = 0): boolean {
  if (buf.length < offset + bytes.length) return false
  for (let i = 0; i < bytes.length; i++) {
    if (buf[offset + i] !== bytes[i]) return false
  }
  return true
}

function u16(buf: Uint8Array, off: number, le: boolean): number {
  return le ? buf[off] | (buf[off + 1] << 8) : (buf[off] << 8) | buf[off + 1]
}

function u32(buf: Uint8Array, off: number, le: boolean): number {
  return le
    ? (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16) | (buf[off + 3] << 24)) >>> 0
    : ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0
}

// ---------- ELF ----------

const ELF_MACHINE: Record<number, string> = {
  0: 'none',
  2: 'SPARC',
  3: 'Intel 80386',
  8: 'MIPS',
  20: 'PowerPC',
  21: 'PowerPC64',
  22: 'IBM S/390',
  40: 'ARM',
  42: 'Renesas SH',
  43: 'SPARC v9',
  50: 'Intel IA-64',
  62: 'AMD x86-64',
  83: 'Atmel AVR',
  94: 'Xtensa',
  105: 'TI MSP430',
  183: 'ARM aarch64',
  224: 'AMD GPU',
  243: 'RISC-V',
  247: 'Linux BPF',
  252: 'C-SKY',
  258: 'LoongArch',
}

const ELF_OSABI: Record<number, string> = {
  0: 'SYSV',
  1: 'HP-UX',
  2: 'NetBSD',
  3: 'GNU/Linux',
  4: 'GNU/Hurd',
  6: 'Solaris',
  7: 'AIX',
  8: 'IRIX',
  9: 'FreeBSD',
  10: 'Tru64',
  11: 'Novell Modesto',
  12: 'OpenBSD',
  13: 'OpenVMS',
  14: 'NonStop Kernel',
  15: 'AROS',
  16: 'FenixOS',
  17: 'Nuxi CloudABI',
  18: 'OpenVOS',
  64: 'ARM EABI',
  97: 'ARM',
  255: 'standalone (embedded)',
}

const ELF_TYPE: Record<number, string> = {
  0: 'NONE',
  1: 'relocatable',
  2: 'executable',
  3: 'shared object',
  4: 'core dump',
}

const PT_LOAD = 1
const PT_DYNAMIC = 2
const PT_INTERP = 3
const PT_NOTE = 4

const DT_NULL = 0
const DT_NEEDED = 1
const DT_STRTAB = 5
const DT_STRSZ = 10
const DT_SONAME = 14
const DT_RPATH = 15
const DT_DEBUG = 21
const DT_RUNPATH = 29

const SHT_SYMTAB = 2

interface ElfPhdr {
  type: number
  offset: number
  vaddr: number
  filesz: number
  flags: number
}

function parseElfPhdrs(view: View, le: boolean, is64: boolean, ePhoff: number, ePhentsize: number, ePhnum: number): ElfPhdr[] {
  const phdrs: ElfPhdr[] = []
  const size = ePhentsize || (is64 ? 56 : 32)
  for (let i = 0; i < ePhnum; i++) {
    const off = ePhoff + i * size
    if (is64) {
      phdrs.push({
        type: view.u32(off, le),
        flags: view.u32(off + 4, le),
        offset: view.u64Low(off + 8, le),
        vaddr: view.u64Low(off + 16, le),
        filesz: view.u64Low(off + 32, le),
      })
    } else {
      phdrs.push({
        type: view.u32(off, le),
        offset: view.u32(off + 4, le),
        vaddr: view.u32(off + 8, le),
        filesz: view.u32(off + 16, le),
        flags: view.u32(off + 24, le),
      })
    }
  }
  return phdrs
}

function vaddrToOffset(phdrs: ElfPhdr[], vaddr: number): number {
  for (const p of phdrs) {
    if (p.type !== PT_LOAD) continue
    if (vaddr >= p.vaddr && vaddr < p.vaddr + p.filesz) {
      return p.offset + (vaddr - p.vaddr)
    }
  }
  return -1
}

interface DynInfo {
  soname: string
  needed: string[]
  rpath: string[]
  hasDebug: boolean
  hasStrtab: boolean
  strtabOff: number
  strtabSize: number
}

function parseDynamic(view: View, le: boolean, is64: boolean, phdrs: ElfPhdr[]): DynInfo {
  const result: DynInfo = { soname: '', needed: [], rpath: [], hasDebug: false, hasStrtab: false, strtabOff: -1, strtabSize: 0 }
  const dyn = phdrs.find(p => p.type === PT_DYNAMIC)
  if (!dyn || dyn.filesz === 0) return result

  const entSize = is64 ? 16 : 8
  const count = Math.min(Math.floor(dyn.filesz / entSize), 512)
  const tags: Array<{ tag: number; val: number }> = []

  for (let i = 0; i < count; i++) {
    const off = dyn.offset + i * entSize
    let tag: number, val: number
    if (is64) {
      tag = view.u64Low(off, le)
      val = view.u64Low(off + 8, le)
    } else {
      tag = view.u32(off, le)
      val = view.u32(off + 4, le)
    }
    if (tag === DT_NULL) break
    tags.push({ tag, val })
  }

  const strtabVaddr = tags.find(t => t.tag === DT_STRTAB)?.val ?? 0
  result.strtabSize = tags.find(t => t.tag === DT_STRSZ)?.val ?? 0
  result.strtabOff = strtabVaddr ? vaddrToOffset(phdrs, strtabVaddr) : -1
  result.hasStrtab = result.strtabOff >= 0

  const readDynStr = (val: number): string => {
    if (result.strtabOff < 0) return ''
    return view.cstr(result.strtabOff + val)
  }

  for (const t of tags) {
    if (t.tag === DT_DEBUG) result.hasDebug = true
    else if (t.tag === DT_SONAME) result.soname = readDynStr(t.val)
    else if (t.tag === DT_NEEDED) {
      const n = readDynStr(t.val)
      if (n) result.needed.push(n)
    } else if (t.tag === DT_RPATH || t.tag === DT_RUNPATH) {
      const p = readDynStr(t.val)
      if (p) result.rpath.push(p)
    }
  }
  return result
}

function parseInterp(view: View, phdrs: ElfPhdr[]): string {
  const interp = phdrs.find(p => p.type === PT_INTERP)
  if (!interp) return ''
  return view.cstr(interp.offset, 128)
}

function parseBuildId(view: View, phdrs: ElfPhdr[]): string {
  for (const p of phdrs) {
    if (p.type !== PT_NOTE) continue
    let off = p.offset
    const end = p.offset + p.filesz
    let guard = 0
    while (off + 12 <= end && guard++ < 32) {
      const namesz = view.u32(off, true)
      const descsz = view.u32(off + 4, true)
      const ntype = view.u32(off + 8, true)
      const nameOff = off + 12
      const namePad = (namesz + 3) & ~3
      const descOff = nameOff + namePad
      const descPad = (descsz + 3) & ~3
      const name = view.cstr(nameOff, namesz || 16)
      if (name === 'GNU' && ntype === 3 && descsz > 0 && descsz <= 64) {
        let s = ''
        for (let i = 0; i < descsz; i++) s += hexLower(view.u8(descOff + i), 2)
        return s
      }
      off = descOff + descPad
    }
  }
  return ''
}

function peekShstrtab(view: View, le: boolean, is64: boolean, eShoff: number, eShentsize: number, eShnum: number, eShstrndx: number): { off: number; size: number } {
  if (eShoff === 0 || eShnum === 0 || eShstrndx === 0 || eShstrndx >= eShnum) return { off: -1, size: 0 }
  const size = eShentsize || (is64 ? 64 : 40)
  const sh = eShoff + eShstrndx * size
  const shOff = is64 ? view.u64Low(sh + 24, le) : view.u32(sh + 16, le)
  const shSize = is64 ? view.u64Low(sh + 32, le) : view.u32(sh + 20, le)
  return { off: shOff, size: shSize }
}

function parseStripped(view: View, le: boolean, is64: boolean, eShoff: number, eShentsize: number, eShnum: number, eShstrndx: number): { stripped: boolean; hasDebugInfo: boolean; hasSymtab: boolean } {
  if (eShoff === 0 || eShnum === 0) return { stripped: true, hasDebugInfo: false, hasSymtab: false }
  const size = eShentsize || (is64 ? 64 : 40)
  let hasSymtab = false
  let hasDebugInfo = false

  const shstr = peekShstrtab(view, le, is64, eShoff, eShentsize, eShnum, eShstrndx)

  for (let i = 0; i < eShnum; i++) {
    const off = eShoff + i * size
    const shType = view.u32(off + 4, le)
    if (shType === SHT_SYMTAB) hasSymtab = true
    if (shstr.off >= 0) {
      const nameOff = is64 ? view.u64Low(off, le) : view.u32(off, le)
      const name = view.cstr(shstr.off + nameOff, 32)
      if (name.startsWith('.debug_')) hasDebugInfo = true
    }
  }
  return { stripped: !hasSymtab, hasDebugInfo, hasSymtab }
}

function tryParseElf(view: View): PartialReport | null {
  if (!view.startsWith([0x7f, 0x45, 0x4c, 0x46])) return null

  const eiClass = view.u8(4)
  const eiData = view.u8(5)
  const eiVersion = view.u8(6)
  const eiOsabi = view.u8(7)
  const eiAbiversion = view.u8(8)

  const is64 = eiClass === 2
  const bits = is64 ? 64 : eiClass === 1 ? 32 : 0
  const le = eiData === 1
  const endian = eiData === 1 ? 'LSB' : eiData === 2 ? 'MSB' : 'unknown'

  const eType = view.u16(16, le)
  const eMachine = view.u16(18, le)
  const eVersion = view.u32(20, le)
  const eEntry = is64 ? view.u64Low(24, le) : view.u32(24, le)
  const ePhoff = is64 ? view.u64Low(32, le) : view.u32(28, le)
  const eShoff = is64 ? view.u64Low(40, le) : view.u32(32, le)
  const eFlags = is64 ? view.u32(48, le) : view.u32(36, le)
  const ePhentsize = view.u16(is64 ? 54 : 42, le) || (is64 ? 56 : 32)
  const ePhnum = view.u16(is64 ? 56 : 44, le)
  const eShentsize = view.u16(is64 ? 58 : 46, le) || (is64 ? 64 : 40)
  const eShnum = view.u16(is64 ? 60 : 48, le)
  const eShstrndx = view.u16(is64 ? 62 : 50, le)

  const phdrs = parseElfPhdrs(view, le, is64, ePhoff, ePhentsize, ePhnum)
  const interp = parseInterp(view, phdrs)
  const dyn = parseDynamic(view, le, is64, phdrs)
  const buildId = parseBuildId(view, phdrs)
  const { stripped, hasDebugInfo } = parseStripped(view, le, is64, eShoff, eShentsize, eShnum, eShstrndx)

  const machineName = ELF_MACHINE[eMachine] || `unknown (${eMachine})`
  const osabiName = ELF_OSABI[eiOsabi] || `unknown (${eiOsabi})`

  const isDynLinked = !!interp || dyn.needed.length > 0 || dyn.soname !== ''
  const linkNote = isDynLinked ? 'dynamically linked' : eType === 1 ? '' : 'statically linked'

  let typeName = ELF_TYPE[eType] || `unknown (${eType})`
  let isLibrary = false

  if (eType === 1) {
    typeName = 'relocatable'
  } else if (eType === 2) {
    typeName = 'executable'
  } else if (eType === 3) {
    if (interp) {
      typeName = 'pie executable'
    } else if (dyn.needed.length > 0 || dyn.soname) {
      typeName = 'shared object'
      isLibrary = true
    } else if (dyn.hasDebug || !phdrs.some(p => p.type === PT_DYNAMIC)) {
      typeName = 'pie executable'
    } else {
      typeName = 'shared object'
      isLibrary = true
    }
  }

  const category: FileReport['category'] =
    eType === 1 ? 'object' : isLibrary ? 'library' : 'executable'

  const archShort = elfArchShort(eMachine)
  const osShort = eiOsabi === 3 ? 'GNU/Linux' : eiOsabi === 0 ? 'SYSV' : osabiName

  const parts = [
    `ELF ${bits}-bit ${endian} ${typeName}, ${archShort}, version ${eiVersion === 1 ? '1' : String(eiVersion)} (${osabiName})`,
  ]
  if (linkNote) parts.push(linkNote)
  if (interp) parts.push(`interpreter ${interp}`)
  if (buildId) parts.push(`BuildID[sha1]=${buildId}`)
  if (eType !== 1) {
    if (stripped) parts.push('stripped')
    else if (hasDebugInfo) parts.push('with debug_info, not stripped')
    else parts.push('not stripped')
  }

  const summary = parts.join(', ')

  const fields: Field[] = [
    { label: 'EI_CLASS', value: `${eiClass} (${bits}-bit)` },
    { label: 'EI_DATA', value: `${eiData} (${le ? 'little-endian' : 'big-endian'})` },
    { label: 'EI_VERSION', value: eiVersion },
    { label: 'EI_OSABI', value: `${eiOsabi} (${osabiName})` },
    { label: 'EI_ABIVERSION', value: eiAbiversion },
    { label: 'e_type', value: `${eType} (${typeName})` },
    { label: 'e_machine', value: `${eMachine} (${machineName})` },
    { label: 'e_version', value: eVersion },
    { label: 'e_entry', value: `0x${hex(eEntry, is64 ? 16 : 8)}` },
    { label: 'e_phoff / e_phnum', value: `${ePhoff} / ${ePhnum}` },
    { label: 'e_shoff / e_shnum', value: `${eShoff} / ${eShnum}`, note: stripped ? '无 .symtab（stripped）' : '含 .symtab' },
    { label: 'e_flags', value: `0x${hex(eFlags, 8)}`, note: elfFlagsNote(eMachine, eFlags) },
  ]

  if (interp) fields.push({ label: 'PT_INTERP', value: interp })
  if (dyn.soname) fields.push({ label: 'DT_SONAME', value: dyn.soname })
  if (dyn.needed.length) fields.push({ label: 'DT_NEEDED', value: dyn.needed.join(', ') })
  if (dyn.rpath.length) fields.push({ label: 'RPATH/RUNPATH', value: dyn.rpath.join(': ') })
  if (dyn.hasDebug) fields.push({ label: 'DT_DEBUG', value: true, note: '链接器写入，表明为可执行文件' })
  if (buildId) fields.push({ label: 'BuildID', value: buildId })
  if (hasDebugInfo) fields.push({ label: 'debug_info', value: true, note: '含 .debug_* 节' })
  fields.push({ label: '链接方式', value: linkNote || '-' })
  fields.push({ label: '运行平台', value: `${osShort} ${archShort}` })

  return {
    summary,
    format: 'ELF',
    mime: isLibrary ? 'application/x-sharedlib' : eType === 1 ? 'application/x-object' : 'application/x-elf',
    category,
    platform: `${osShort} ${archShort}`,
    fields,
  }
}

function elfArchShort(m: number): string {
  switch (m) {
    case 3: return 'Intel 80386'
    case 62: return 'x86-64'
    case 40: return 'ARM'
    case 183: return 'ARM aarch64'
    case 243: return 'RISC-V'
    case 258: return 'LoongArch'
    case 20: return 'PowerPC'
    case 21: return 'PowerPC64'
    case 8: return 'MIPS'
    case 50: return 'Intel IA-64'
    case 22: return 'IBM S/390'
    default: return ELF_MACHINE[m] || `unknown(${m})`
  }
}

function elfFlagsNote(machine: number, flags: number): string {
  if (flags === 0) return ''
  const parts: string[] = []
  if (machine === 243) {
    if (flags & 0x1) parts.push('RVC')
    if (flags & 0x8) parts.push('RVE')
    const abi = (flags >> 1) & 0x3
    const floatAbi = ['', 'soft-float', 'single-float', 'double-float'][abi] ?? ''
    if (floatAbi) parts.push(floatAbi)
  }
  if (machine === 40) {
    const eabi = (flags >> 24) & 0xff
    if (eabi) parts.push(`EABI v${eabi}`)
    if (flags & 0x00800000) parts.push('BE8')
  }
  return parts.filter(Boolean).join(', ')
}

// ---------- PE / MZ ----------

const PE_MACHINE: Record<number, string> = {
  0x014c: 'Intel 386 (x86)',
  0x0162: 'MIPS R3000',
  0x0166: 'MIPS R4000',
  0x0168: 'MIPS R10000',
  0x01a2: 'Hitachi SH3',
  0x01a3: 'Hitachi SH3 DSP',
  0x01a6: 'Hitachi SH4',
  0x01c0: 'ARM little-endian',
  0x01c2: 'ARM Thumb',
  0x01c4: 'ARM Thumb-2 (ARMNT)',
  0x01d3: 'Matsushita AM33',
  0x01f0: 'PowerPC little-endian',
  0x01f1: 'PowerPC with floating point',
  0x0200: 'Intel Itanium (IA-64)',
  0x0266: 'MIPS16',
  0x0366: 'MIPS with FPU',
  0x0466: 'MIPS16 with FPU',
  0x0520: 'Infineon',
  0x0cef: 'EFI byte code',
  0x8664: 'AMD64 (x86-64)',
  0x9041: 'Mitsubishi M32R',
  0xaa64: 'ARM64 (AArch64)',
  0xa641: 'ARM64EC',
  0xa64e: 'ARM64X',
  0x5032: 'RISC-V 32-bit',
  0x5064: 'RISC-V 64-bit',
  0x5128: 'RISC-V 128-bit',
  0x6232: 'LoongArch 32-bit',
  0x6264: 'LoongArch 64-bit',
  0x0284: 'Alpha 64',
}

const PE_SUBSYSTEM: Record<number, string> = {
  0: 'unknown',
  1: 'native (driver / native process)',
  2: 'Windows GUI',
  3: 'Windows CUI (console)',
  5: 'OS/2 CUI',
  7: 'POSIX CUI',
  8: 'Windows CE GUI',
  9: 'Windows CE GUI',
  10: 'EFI application',
  11: 'EFI boot service driver',
  12: 'EFI runtime driver',
  13: 'EFI ROM image',
  14: 'Xbox',
  16: 'Windows boot application',
}

function peArchShort(m: number): string {
  switch (m) {
    case 0x014c: return 'x86'
    case 0x8664: return 'x86-64'
    case 0xaa64: return 'ARM64'
    case 0x01c0: case 0x01c2: case 0x01c4: return 'ARM'
    case 0x0200: return 'IA-64'
    case 0x5032: return 'RISC-V 32'
    case 0x5064: return 'RISC-V 64'
    case 0x6232: return 'LoongArch32'
    case 0x6264: return 'LoongArch64'
    default: return PE_MACHINE[m] || `unknown(${hex(m, 4)})`
  }
}

function tryParsePe(head: Uint8Array, fileSize: number): PartialReport | null {
  if (!startsWith(head, [0x4d, 0x5a])) return null

  if (head.length < 0x40) {
    return {
      summary: 'MS-DOS executable (MZ)',
      format: 'MZ',
      mime: 'application/x-dosexec',
      category: 'executable',
      platform: 'MS-DOS',
      fields: [{ label: 'e_magic', value: 'MZ' }],
    }
  }

  const eLfanew = u32(head, 0x3c, true)

  if (eLfanew < 0x40 || eLfanew + 24 > fileSize || eLfanew + 24 > head.length) {
    return {
      summary: 'MS-DOS executable (MZ)',
      format: 'MZ',
      mime: 'application/x-dosexec',
      category: 'executable',
      platform: 'MS-DOS',
      fields: [
        { label: 'e_magic', value: 'MZ' },
        { label: 'e_lfanew', value: `0x${hex(eLfanew)}`, note: '无有效 PE 头' },
      ],
    }
  }

  if (!startsWith(head, [0x50, 0x45, 0x00, 0x00], eLfanew)) {
    return {
      summary: 'MS-DOS executable (MZ)',
      format: 'MZ',
      mime: 'application/x-dosexec',
      category: 'executable',
      platform: 'MS-DOS',
      fields: [
        { label: 'e_magic', value: 'MZ' },
        { label: 'e_lfanew', value: `0x${hex(eLfanew)}` },
      ],
    }
  }

  const coff = eLfanew + 4
  const machine = u16(head, coff, true)
  const numberOfSections = u16(head, coff + 2, true)
  const timeDateStamp = u32(head, coff + 4, true)
  const sizeOfOptionalHeader = u16(head, coff + 16, true)
  const characteristics = u16(head, coff + 18, true)

  const opt = coff + 20
  const optMagic = sizeOfOptionalHeader >= 2 ? u16(head, opt, true) : 0
  const isPE32Plus = optMagic === 0x20b
  const isPE32 = optMagic === 0x10b

  let subsystem = 0
  if (sizeOfOptionalHeader >= 70) {
    subsystem = u16(head, opt + 68, true)
  }

  const isDll = (characteristics & 0x2000) !== 0
  const isExe = (characteristics & 0x0002) !== 0

  let dotNet = false
  if (sizeOfOptionalHeader >= 224) {
    const dirOffset = isPE32Plus ? 224 : 208
    if (opt + dirOffset + 8 <= head.length) {
      const clrRva = u32(head, opt + dirOffset, true)
      if (clrRva !== 0) dotNet = true
    }
  }

  const machineName = peArchShort(machine)
  const subsystemName = PE_SUBSYSTEM[subsystem] || `unknown (${subsystem})`
  const kind = isDll ? 'DLL' : isExe ? 'executable' : 'object'
  const peLabel = isPE32Plus ? 'PE32+' : isPE32 ? 'PE32' : 'PE'
  const subShort =
    subsystem === 2 ? 'GUI' :
    subsystem === 3 ? 'console' :
    subsystem === 1 ? 'native' :
    subsystem >= 10 && subsystem <= 14 ? 'EFI' :
    subsystemName.split(' ')[0]

  const summary =
    `${peLabel} ${kind}${isDll ? ' (DLL)' : ` (${subShort})`} ${machineName}, for MS Windows${dotNet ? ', .NET assembly' : ''}`

  const charFlags: string[] = []
  if (characteristics & 0x0001) charFlags.push('RELOCS_STRIPPED')
  if (characteristics & 0x0002) charFlags.push('EXECUTABLE_IMAGE')
  if (characteristics & 0x0020) charFlags.push('LARGE_ADDRESS_AWARE')
  if (characteristics & 0x0100) charFlags.push('32BIT_MACHINE')
  if (characteristics & 0x0200) charFlags.push('DEBUG_STRIPPED')
  if (characteristics & 0x1000) charFlags.push('SYSTEM')
  if (characteristics & 0x2000) charFlags.push('DLL')

  const fields: Field[] = [
    { label: 'e_lfanew', value: `0x${hex(eLfanew)}` },
    { label: 'Machine', value: `0x${hex(machine, 4)} (${machineName})` },
    { label: 'NumberOfSections', value: numberOfSections },
    { label: 'TimeDateStamp', value: timeDateStamp === 0 || timeDateStamp === 0xffffffff ? String(timeDateStamp) : new Date(timeDateStamp * 1000).toISOString(), note: timeDateStamp ? 'Unix epoch' : 'absent' },
    { label: 'SizeOfOptionalHeader', value: sizeOfOptionalHeader },
    { label: 'Characteristics', value: `0x${hex(characteristics, 4)}`, note: charFlags.join(' | ') },
    { label: 'OptionalHeader.Magic', value: `0x${hex(optMagic, 4)} (${isPE32Plus ? 'PE32+' : isPE32 ? 'PE32' : 'ROM/unknown'})` },
    { label: 'Subsystem', value: `${subsystem} (${subsystemName})` },
    { label: '运行平台', value: `Windows ${machineName}` },
  ]
  if (dotNet) fields.push({ label: '.NET', value: true, note: 'CLR Runtime Header 存在' })

  return {
    summary,
    format: peLabel,
    mime: isDll ? 'application/x-msdownload' : 'application/vnd.microsoft.portable-executable',
    category: isDll ? 'library' : 'executable',
    platform: `Windows ${machineName}`,
    fields,
  }
}

// ---------- Mach-O ----------

const MACH_CPUTYPE: Record<number, string> = {
  1: 'VAX',
  6: 'm68k',
  7: 'x86',
  10: 'mc98000',
  11: 'HPPA',
  12: 'ARM',
  13: 'm88k',
  14: 'SPARC',
  15: 'i860',
  18: 'PowerPC',
  0x01000007: 'x86_64',
  0x0100000c: 'ARM64',
  0x0200000c: 'ARM64_32',
  0x01000012: 'PowerPC64',
}

const MACH_FILETYPE: Record<number, string> = {
  1: 'object',
  2: 'executable',
  3: 'fvmlib',
  4: 'core',
  5: 'preload',
  6: 'dylib',
  7: 'dylinker',
  8: 'bundle',
  9: 'dylib stub',
  10: 'dsym',
  11: 'kext bundle',
  12: 'fileset',
}

function machCpuShort(cputype: number): string {
  switch (cputype) {
    case 7: return 'i386'
    case 0x01000007: return 'x86_64'
    case 12: return 'arm'
    case 0x0100000c: return 'arm64'
    case 0x0200000c: return 'arm64_32'
    case 18: return 'ppc'
    case 0x01000012: return 'ppc64'
    default: return MACH_CPUTYPE[cputype] || `cpu(${hex(cputype)})`
  }
}

function machSubtypeName(cputype: number, cpusubtype: number): string {
  const sub = cpusubtype & 0x00ffffff
  if (cputype === 0x0100000c) {
    if (sub === 0) return 'all'
    if (sub === 2) return 'arm64e'
    return `arm64_v${sub}`
  }
  if (cputype === 12) {
    const map: Record<number, string> = {
      0: 'all', 5: 'v4t', 6: 'v6', 7: 'v5tej', 8: 'xscale', 9: 'v7',
      10: 'v7f', 11: 'v7s', 12: 'v7k', 13: 'v8', 14: 'v6m', 15: 'v7m', 16: 'v7em',
    }
    return map[sub] || `sub${sub}`
  }
  if (cputype === 7 || cputype === 0x01000007) {
    if (sub === 3) return 'all'
    if (sub === 8) return 'x86_64_h'
    return `sub${sub}`
  }
  return sub === 0 ? 'all' : `sub${sub}`
}

function tryParseMachO(head: Uint8Array): PartialReport | null {
  if (head.length < 28) return null

  const magics: Array<{ bytes: number[]; le: boolean; bits: number }> = [
    { bytes: [0xce, 0xfa, 0xed, 0xfe], le: true, bits: 32 },
    { bytes: [0xfe, 0xed, 0xfa, 0xce], le: false, bits: 32 },
    { bytes: [0xcf, 0xfa, 0xed, 0xfe], le: true, bits: 64 },
    { bytes: [0xfe, 0xed, 0xfa, 0xcf], le: false, bits: 64 },
  ]

  for (const m of magics) {
    if (!startsWith(head, m.bytes)) continue

    const le = m.le
    const cputype = u32(head, 4, le)
    const cpusubtype = u32(head, 8, le)
    const filetype = u32(head, 12, le)
    const ncmds = u32(head, 16, le)
    const sizeofcmds = u32(head, 20, le)
    const flags = u32(head, 24, le)

    const cpuName = machCpuShort(cputype)
    const subtype = machSubtypeName(cputype, cpusubtype)
    const typeName = MACH_FILETYPE[filetype] || `unknown (${filetype})`
    const endian = le ? 'little-endian' : 'big-endian'

    const isDylib = filetype === 6 || filetype === 9
    const isBundle = filetype === 8
    const category: FileReport['category'] = isDylib || isBundle ? 'library' : filetype === 1 ? 'object' : 'executable'

    const pie = (flags & 0x200000) !== 0
    const dyld = (flags & 0x4) !== 0

    const archLabel = subtype === 'all' ? cpuName : `${cpuName}${subtype === 'arm64e' ? 'e' : ` (${subtype})`}`
    const kindLabel = isDylib ? 'dylib' : isBundle ? 'bundle' : typeName

    const summary =
      `Mach-O ${m.bits}-bit ${kindLabel} ${archLabel}, flags:<${machFlagsStr(flags)}>`

    const fields: Field[] = [
      { label: 'magic', value: `0x${hex(u32(head, 0, le), 8)}`, note: `${m.bits}-bit ${endian}` },
      { label: 'cputype', value: `${cputype} (${cpuName})` },
      { label: 'cpusubtype', value: `${cpusubtype >>> 0} (${subtype})` },
      { label: 'filetype', value: `${filetype} (${typeName})` },
      { label: 'ncmds', value: ncmds },
      { label: 'sizeofcmds', value: sizeofcmds },
      { label: 'flags', value: `0x${hex(flags, 8)}`, note: machFlagsStr(flags) },
    ]
    if (pie) fields.push({ label: 'MH_PIE', value: true })
    if (dyld) fields.push({ label: 'MH_DYLDLINK', value: true, note: 'dynamically linked' })
    fields.push({ label: '运行平台', value: `macOS ${archLabel}` })

    return {
      summary,
      format: `Mach-O ${m.bits}`,
      mime: 'application/x-mach-binary',
      category,
      platform: `macOS ${archLabel}`,
      fields,
    }
  }

  return null
}

function machFlagsStr(flags: number): string {
  const parts: string[] = []
  if (flags & 0x1) parts.push('NOUNDEFS')
  if (flags & 0x4) parts.push('DYLDLINK')
  if (flags & 0x80) parts.push('TWOLEVEL')
  if (flags & 0x200000) parts.push('PIE')
  if (flags & 0x1000000) parts.push('NO_HEAP_EXECUTION')
  if (flags & 0x2000000) parts.push('APP_EXTENSION_SAFE')
  return parts.join('|') || '-'
}

// ---------- Java class vs Mach-O Fat (CA FE BA BE) ----------

function tryParseJavaOrFat(head: Uint8Array, fileSize: number): PartialReport | null {
  if (!startsWith(head, [0xca, 0xfe, 0xba, 0xbe])) return null

  if (head.length >= 8) {
    const maybeNfat = u32(head, 4, true)
    const maybeNfatBE = u32(head, 4, false)
    for (const nfat of [maybeNfatBE, maybeNfat]) {
      if (nfat >= 1 && nfat <= 20 && 8 + nfat * 20 <= fileSize) {
        let plausible = true
        const archs: string[] = []
        for (let i = 0; i < nfat; i++) {
          const off = 8 + i * 20
          if (off + 20 > head.length) { plausible = false; break }
          const cputype = u32(head, off, false)
          const cpusubtype = u32(head, off + 4, false)
          const offset = u32(head, off + 8, false)
          const size = u32(head, off + 12, false)
          const known = cputype in MACH_CPUTYPE
          if (!known || offset + size > fileSize || size === 0) { plausible = false; break }
          archs.push(machCpuShort(cputype) + (machSubtypeName(cputype, cpusubtype) === 'arm64e' ? 'e' : ''))
        }
        if (plausible && archs.length === nfat) {
          return {
            summary: `Mach-O universal binary with ${nfat} architectures: [${archs.join('] [')}]`,
            format: 'Mach-O fat',
            mime: 'application/x-mach-binary',
            category: 'executable',
            platform: `macOS (${archs.join(', ')})`,
            fields: [
              { label: 'FAT_MAGIC', value: '0xCAFEBABE', note: 'always big-endian' },
              { label: 'nfat_arch', value: nfat },
              ...archs.map((a, i) => ({ label: `arch[${i}]`, value: a })),
              { label: '运行平台', value: `macOS universal (${archs.join(', ')})` },
            ],
          }
        }
      }
    }
  }

  if (head.length >= 8) {
    const minor = u16(head, 4, false)
    const major = u16(head, 6, false)
    if (major >= 45 && major <= 80 && (minor === 0 || minor === 65535)) {
      const javaSe = majorToJavaSe(major)
      return {
        summary: `Java class file, version ${major}.${minor === 65535 ? 65535 : minor} (Java SE ${javaSe}), platform-independent`,
        format: 'Java class',
        mime: 'application/java-vm',
        category: 'executable',
        platform: 'JVM (platform-independent)',
        fields: [
          { label: 'magic', value: '0xCAFEBABE' },
          { label: 'minor_version', value: minor, note: minor === 65535 ? 'preview features' : '' },
          { label: 'major_version', value: major, note: `Java SE ${javaSe}` },
          { label: '运行平台', value: 'JVM（跨平台）' },
        ],
      }
    }
  }

  return {
    summary: 'Java class or Mach-O fat (ambiguous)',
    format: 'CAFEBABE',
    mime: 'application/octet-stream',
    category: 'data',
    platform: null,
    fields: [
      { label: 'magic', value: '0xCAFEBABE', note: 'Java class 与 Mach-O Fat 共用魔数，后续字段无法判定' },
    ],
  }
}

function majorToJavaSe(major: number): string {
  if (major < 45) return '?'
  if (major === 45) return '1.1'
  if (major === 46) return '1.2'
  if (major === 47) return '1.3'
  if (major === 48) return '1.4'
  if (major === 49) return '5'
  if (major === 50) return '6'
  if (major === 51) return '7'
  if (major >= 52 && major <= 80) return String(major - 44)
  return String(major - 44)
}

// ---------- WASM ----------

function tryParseWasm(head: Uint8Array): PartialReport | null {
  if (!startsWith(head, [0x00, 0x61, 0x73, 0x6d])) return null
  const version = head.length >= 8 ? u32(head, 4, true) : 0
  const isComponent = head.length >= 8 && head[4] === 0x0d && head[5] === 0x00
  return {
    summary: isComponent
      ? 'WebAssembly component, version 1'
      : `WebAssembly module, version ${version}`,
    format: 'WASM',
    mime: 'application/wasm',
    category: 'executable',
    platform: 'WebAssembly VM (platform-independent)',
    fields: [
      { label: 'magic', value: '\\0asm' },
      { label: 'version', value: version },
      { label: '运行平台', value: 'WASM VM（跨平台）' },
    ],
  }
}

// ---------- Images ----------

function tryParseImages(head: Uint8Array): PartialReport | null {
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    let width = 0, height = 0, bitDepth = 0, colorType = 0
    if (head.length >= 26 && ascii(head, 12, 4) === 'IHDR') {
      width = u32(head, 16, false)
      height = u32(head, 20, false)
      bitDepth = head[24]
      colorType = head[25]
    }
    const colorNames: Record<number, string> = { 0: 'grayscale', 2: 'RGB', 3: 'indexed', 4: 'grayscale+alpha', 6: 'RGBA' }
    const fields: Field[] = [
      { label: 'signature', value: '89 50 4E 47 0D 0A 1A 0A' },
    ]
    if (width) {
      fields.push({ label: 'width', value: width })
      fields.push({ label: 'height', value: height })
      fields.push({ label: 'bit_depth', value: bitDepth })
      fields.push({ label: 'color_type', value: `${colorType} (${colorNames[colorType] ?? '?'})` })
    }
    return {
      summary: width
        ? `PNG image data, ${width} x ${height}, ${bitDepth}-bit/color ${colorNames[colorType] ?? ''}`.trim()
        : 'PNG image data',
      format: 'PNG',
      mime: 'image/png',
      category: 'image',
      platform: null,
      fields,
    }
  }

  if (startsWith(head, [0xff, 0xd8, 0xff])) {
    const marker = head[3]
    const markerName = marker === 0xe0 ? 'JFIF' : marker === 0xe1 ? 'Exif' : marker === 0xdb ? 'raw' : `0x${hex(marker, 2)}`
    return {
      summary: `JPEG image data, ${markerName}`,
      format: 'JPEG',
      mime: 'image/jpeg',
      category: 'image',
      platform: null,
      fields: [
        { label: 'SOI', value: 'FF D8 FF' },
        { label: 'APP marker', value: `${markerName}` },
      ],
    }
  }

  if (startsWith(head, [0x47, 0x49, 0x46, 0x38])) {
    const ver = ascii(head, 0, 6)
    const width = u16(head, 6, true)
    const height = u16(head, 8, true)
    return {
      summary: `GIF image data, version ${ver.slice(3)}, ${width} x ${height}`,
      format: 'GIF',
      mime: 'image/gif',
      category: 'image',
      platform: null,
      fields: [
        { label: 'version', value: ver.slice(3) },
        { label: 'width', value: width },
        { label: 'height', value: height },
      ],
    }
  }

  if (startsWith(head, [0x42, 0x4d]) && head.length >= 14) {
    const size = u32(head, 2, true)
    const dataOffset = u32(head, 10, true)
    let width = 0, height = 0
    if (head.length >= 26) {
      width = u32(head, 18, true)
      height = u32(head, 22, true) | 0
      if (height < 0) height = -height
    }
    return {
      summary: width ? `BMP image data, ${width} x ${Math.abs(height)}` : 'BMP image data',
      format: 'BMP',
      mime: 'image/bmp',
      category: 'image',
      platform: null,
      fields: [
        { label: 'bfSize', value: size },
        { label: 'bfOffBits', value: dataOffset },
        ...(width ? [{ label: 'width', value: width }, { label: 'height', value: Math.abs(height) }] : []),
      ],
    }
  }

  if (startsWith(head, [0x49, 0x49, 0x2a, 0x00]) || startsWith(head, [0x4d, 0x4d, 0x00, 0x2a])) {
    const le = head[0] === 0x49
    return {
      summary: `TIFF image data, ${le ? 'little-endian' : 'big-endian'}`,
      format: 'TIFF',
      mime: 'image/tiff',
      category: 'image',
      platform: null,
      fields: [{ label: 'byte order', value: le ? 'II (LE)' : 'MM (BE)' }],
    }
  }

  if (startsWith(head, [0x00, 0x00, 0x01, 0x00])) {
    const count = u16(head, 4, true)
    return {
      summary: `ICO icon data, ${count} image(s)`,
      format: 'ICO',
      mime: 'image/x-icon',
      category: 'image',
      platform: null,
      fields: [{ label: 'image count', value: count }],
    }
  }

  if (startsWith(head, [0x52, 0x49, 0x46, 0x46]) && head.length >= 12 && ascii(head, 8, 4) === 'WEBP') {
    const chunk = ascii(head, 12, 4)
    let width = 0, height = 0
    if (chunk === 'VP8 ' && head.length >= 30) {
      width = u16(head, 26, true) & 0x3fff
      height = u16(head, 28, true) & 0x3fff
    } else if (chunk === 'VP8L' && head.length >= 25) {
      const b = head[21] | (head[22] << 8) | (head[23] << 16) | (head[24] << 24)
      width = (b & 0x3fff) + 1
      height = ((b >> 14) & 0x3fff) + 1
    }
    const mode = chunk === 'VP8L' ? 'lossless' : chunk === 'VP8X' ? 'extended' : 'lossy'
    return {
      summary: width
        ? `WebP image data, ${width} x ${height}, ${mode}`
        : `WebP image data, ${mode}`,
      format: 'WebP',
      mime: 'image/webp',
      category: 'image',
      platform: null,
      fields: [
        { label: 'RIFF form', value: 'WEBP' },
        { label: 'chunk', value: chunk },
        { label: 'mode', value: mode },
        ...(width ? [{ label: 'width', value: width }, { label: 'height', value: height }] : []),
      ],
    }
  }

  return null
}

// ---------- CRX (Chrome extension) ----------

function readVarint(buf: Uint8Array, off: number, end: number): { value: number; next: number } | null {
  let value = 0
  let shift = 0
  let pos = off
  while (pos < end && shift < 35) {
    const b = buf[pos++]
    value |= (b & 0x7f) << shift
    if ((b & 0x80) === 0) return { value: value >>> 0, next: pos }
    shift += 7
  }
  return null
}

function parseProtoFields(buf: Uint8Array, start: number, end: number): Array<{ field: number; wire: number; bytes?: Uint8Array; value?: number }> {
  const out: Array<{ field: number; wire: number; bytes?: Uint8Array; value?: number }> = []
  let pos = start
  while (pos < end) {
    const tag = readVarint(buf, pos, end)
    if (!tag) break
    const field = tag.value >>> 3
    const wire = tag.value & 7
    pos = tag.next
    if (wire === 0) {
      const v = readVarint(buf, pos, end)
      if (!v) break
      out.push({ field, wire, value: v.value })
      pos = v.next
    } else if (wire === 2) {
      const len = readVarint(buf, pos, end)
      if (!len) break
      pos = len.next
      const take = Math.min(len.value, end - pos)
      out.push({ field, wire, bytes: buf.subarray(pos, pos + take) })
      pos += take
    } else if (wire === 5) {
      pos += 4
    } else if (wire === 1) {
      pos += 8
    } else {
      break
    }
  }
  return out
}

function crxIdToString(id: Uint8Array): string {
  let s = ''
  for (let i = 0; i < id.length; i++) {
    s += String.fromCharCode(0x61 + ((id[i] >> 4) & 0x0f))
    s += String.fromCharCode(0x61 + (id[i] & 0x0f))
  }
  return s
}

function tryParseCrx(head: Uint8Array): PartialReport | null {
  // magic "Cr24"
  if (!startsWith(head, [0x43, 0x72, 0x32, 0x34])) return null
  if (head.length < 12) {
    return {
      summary: 'Chrome extension (CRX), truncated header',
      format: 'CRX',
      mime: 'application/x-chrome-extension',
      category: 'archive',
      platform: 'Chrome / Chromium',
      fields: [{ label: 'magic', value: 'Cr24' }],
    }
  }

  const version = u32(head, 4, true)
  const fields: Field[] = [
    { label: 'magic', value: 'Cr24' },
    { label: 'crx_version', value: version },
  ]

  let zipOffset = 0
  let extId = ''
  let proofCount = 0
  let publicKeys = 0

  if (version === 2) {
    const publicKeyLength = u32(head, 8, true)
    const signatureLength = u32(head, 12, true)
    zipOffset = 16 + publicKeyLength + signatureLength
    fields.push({ label: 'public_key_length', value: publicKeyLength })
    fields.push({ label: 'signature_length', value: signatureLength })
    fields.push({ label: 'zip_offset', value: zipOffset })
    publicKeys = publicKeyLength > 0 ? 1 : 0
  } else if (version === 3) {
    const headerSize = u32(head, 8, true)
    const headerEnd = 12 + headerSize
    zipOffset = headerEnd
    fields.push({ label: 'header_size', value: headerSize })
    fields.push({ label: 'zip_offset', value: zipOffset })

    if (headerSize > 0 && headerEnd <= head.length) {
      const hdrFields = parseProtoFields(head, 12, headerEnd)
      for (const f of hdrFields) {
        if (f.wire !== 2 || !f.bytes) continue
        if (f.field === 2 || f.field === 3) {
          proofCount++
          const proofs = parseProtoFields(f.bytes, 0, f.bytes.length)
          if (proofs.some(p => p.field === 1 && p.bytes && p.bytes.length > 0)) publicKeys++
        } else if (f.field === 10000) {
          const signed = parseProtoFields(f.bytes, 0, f.bytes.length)
          const idField = signed.find(s => s.field === 1 && s.bytes && s.bytes.length > 0)
          if (idField?.bytes) extId = crxIdToString(idField.bytes.subarray(0, 16))
        }
      }
      fields.push({ label: 'key_proofs', value: proofCount })
    }
  } else {
    fields.push({ label: 'note', value: `未知 CRX 版本 ${version}` })
  }

  const zipMagic = zipOffset > 0 && zipOffset + 4 <= head.length && startsWith(head, [0x50, 0x4b], zipOffset)
  if (zipOffset > 0) fields.push({ label: 'zip_payload', value: zipMagic ? 'PK (ZIP)' : zipOffset < head.length ? '未检测到' : '超出读取范围' })
  if (extId) fields.push({ label: 'extension_id', value: extId })
  fields.push({ label: '运行平台', value: 'Chrome / Chromium 扩展' })

  const parts = [`Chrome extension, CRX${version}`]
  if (extId) parts.push(`ID ${extId}`)
  if (version === 2) parts.push(`public key ${u32(head, 8, true)} bytes`)
  if (version === 3 && proofCount) parts.push(`${proofCount} key proof(s)`)
  parts.push('ZIP payload')

  return {
    summary: parts.join(', '),
    format: `CRX${version}`,
    mime: 'application/x-chrome-extension',
    category: 'archive',
    platform: 'Chrome / Chromium',
    fields,
  }
}

// ---------- Archives ----------

function tryParseArchives(head: Uint8Array, zipInfo: ZipNames | null = null): PartialReport | null {
  if (startsWith(head, [0x50, 0x4b, 0x03, 0x04]) || startsWith(head, [0x50, 0x4b, 0x05, 0x06])) {
    const empty = startsWith(head, [0x50, 0x4b, 0x05, 0x06])
    const info = zipInfo ?? { names: empty ? [] : [zipFirstEntryName(head)].filter(Boolean), mimetype: '', source: 'local' as const }
    const firstName = info.names[0] ?? ''
    const kind = empty
      ? { name: 'zip', mime: 'application/zip', suffix: '', platform: null, notes: [] as string[] }
      : classifyZip(info)
    return {
      summary: empty ? 'Zip archive data (empty)' : `${kind.name.startsWith('zip') ? 'Zip archive data' : kind.name.replace(/ \(.*\)/, '') + ' (Zip)'}${kind.suffix}`,
      format: empty
        ? 'ZIP'
        : kind.name.startsWith('APK') ? 'APK'
        : kind.name.startsWith('AAB') ? 'AAB'
        : kind.name.startsWith('AAR') ? 'AAR'
        : kind.name.startsWith('JAR') ? 'JAR'
        : kind.name.startsWith('XAPK') ? 'XAPK'
        : kind.name.startsWith('docx') ? 'DOCX'
        : kind.name.startsWith('xlsx') ? 'XLSX'
        : kind.name.startsWith('pptx') ? 'PPTX'
        : kind.name.startsWith('epub') ? 'EPUB'
        : kind.name.startsWith('ODF') ? 'ODF'
        : 'ZIP',
      mime: kind.mime,
      category: 'archive',
      platform: kind.platform,
      fields: [
        { label: 'signature', value: empty ? 'PK\\x05\\x06 (empty)' : 'PK\\x03\\x04' },
        ...(firstName ? [{ label: 'first entry', value: firstName }] : []),
        ...(info.names.length > 1 ? [{ label: 'entry count', value: info.names.length, note: info.source === 'central-directory' ? '来自中央目录' : '本地头扫描' }] : []),
        { label: 'container', value: kind.name },
        ...(kind.notes.length ? [{ label: '关键文件', value: kind.notes.join(', ') }] : []),
      ],
    }
  }

  if (startsWith(head, [0x1f, 0x8b])) {
    const method = head[2]
    const flg = head[3]
    let fname = ''
    if ((flg & 0x08) && head.length > 10) {
      let i = 10
      if (flg & 0x04) {
        const xlen = u16(head, 10, true)
        i = 12 + xlen
      }
      while (i < head.length && head[i] !== 0 && i < 10 + 256) {
        fname += String.fromCharCode(head[i])
        i++
      }
    }
    const isTarGz = fname.endsWith('.tar') || fname.endsWith('.tgz')
    return {
      summary: `gzip compressed data${fname ? `, was "${fname}"` : ''}${isTarGz ? ' (tar archive)' : ''}`,
      format: 'GZIP',
      mime: 'application/gzip',
      category: 'archive',
      platform: null,
      fields: [
        { label: 'magic', value: '1F 8B' },
        { label: 'compression method', value: method === 8 ? 'deflate' : String(method) },
        { label: 'flags', value: `0x${hex(flg, 2)}` },
        ...(fname ? [{ label: 'original name', value: fname }] : []),
      ],
    }
  }

  if (startsWith(head, [0x42, 0x5a, 0x68])) {
    const level = head[3] - 0x30
    return {
      summary: `bzip2 compressed data, block size ${level * 100}k`,
      format: 'BZip2',
      mime: 'application/x-bzip2',
      category: 'archive',
      platform: null,
      fields: [{ label: 'block size', value: `${level * 100}k` }],
    }
  }

  if (startsWith(head, [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00])) {
    return {
      summary: 'XZ compressed data',
      format: 'XZ',
      mime: 'application/x-xz',
      category: 'archive',
      platform: null,
      fields: [{ label: 'magic', value: 'FD 37 7A 58 5A 00' }],
    }
  }

  if (startsWith(head, [0x28, 0xb5, 0x2f, 0xfd])) {
    return {
      summary: 'Zstandard compressed data',
      format: 'Zstandard',
      mime: 'application/zstd',
      category: 'archive',
      platform: null,
      fields: [{ label: 'magic', value: '28 B5 2F FD' }],
    }
  }

  if (startsWith(head, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) {
    return {
      summary: '7-zip archive data',
      format: '7z',
      mime: 'application/x-7z-compressed',
      category: 'archive',
      platform: null,
      fields: [{ label: 'magic', value: '37 7A BC AF 27 1C' }],
    }
  }

  if (startsWith(head, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07])) {
    const is5 = head[6] === 0x01
    return {
      summary: `RAR archive data, v${is5 ? '5' : '4'}`,
      format: is5 ? 'RAR5' : 'RAR4',
      mime: 'application/vnd.rar',
      category: 'archive',
      platform: null,
      fields: [{ label: 'version', value: is5 ? '5' : '4' }],
    }
  }

  if (head.length > 262 && ascii(head, 257, 5) === 'ustar') {
    const name = ascii(head, 0, 100).replace(/\0.*$/, '')
    return {
      summary: `POSIX tar archive${name ? ` (contains "${name.trim()}")` : ''}`,
      format: 'TAR',
      mime: 'application/x-tar',
      category: 'archive',
      platform: null,
      fields: [
        { label: 'magic', value: 'ustar @ 257' },
        ...(name.trim() ? [{ label: 'first entry', value: name.trim() }] : []),
      ],
    }
  }

  if (startsWith(head, [0x21, 0x3c, 0x61, 0x72, 0x63, 0x68, 0x3e, 0x0a])) {
    return {
      summary: 'ar archive',
      format: 'AR',
      mime: 'application/x-archive',
      category: 'archive',
      platform: null,
      fields: [{ label: 'magic', value: '!<arch>\\n' }],
    }
  }

  if (head.length > 32774 && ascii(head, 32769, 5) === 'CD001') {
    return {
      summary: 'ISO 9660 CD-ROM filesystem data',
      format: 'ISO 9660',
      mime: 'application/x-iso9660-image',
      category: 'archive',
      platform: null,
      fields: [{ label: 'magic', value: 'CD001 @ 32769' }],
    }
  }

  return null
}

function zipFirstEntryName(head: Uint8Array): string {
  const nameLen = u16(head, 26, true)
  const start = 30
  if (start + nameLen > head.length) return ''
  return ascii(head, start, nameLen).replace(/\\/g, '/')
}

interface ZipNames {
  names: string[]
  mimetype: string
  source: 'central-directory' | 'local' | 'mixed'
}

function collectZipNames(view: View, fileSize: number): ZipNames {
  const seen = new Set<string>()
  const names: string[] = []
  let mimetype = ''
  let fromCd = false

  const add = (raw: string) => {
    const name = raw.replace(/\\/g, '/')
    if (name && !seen.has(name)) {
      seen.add(name)
      names.push(name)
    }
  }

  let pos = 0
  let n = 0
  while (n < 2048 && pos + 30 <= fileSize) {
    if (view.u32(pos, true) !== 0x04034b50) break
    const flags = view.u16(pos + 6, true)
    const method = view.u16(pos + 8, true)
    const compSize = view.u32(pos + 18, true)
    const nameLen = view.u16(pos + 26, true)
    const extraLen = view.u16(pos + 28, true)
    if (nameLen === 0 || nameLen > 1024) break
    let name = ''
    for (let i = 0; i < nameLen; i++) {
      const c = view.u8(pos + 30 + i)
      name += c >= 0x20 && c < 0x7f ? String.fromCharCode(c) : ''
    }
    add(name)
    const dataStart = pos + 30 + nameLen + extraLen
    if (name === 'mimetype' && method === 0 && compSize > 0 && compSize < 64) {
      let s = ''
      for (let i = 0; i < compSize; i++) {
        const c = view.u8(dataStart + i)
        s += c >= 0x20 && c < 0x7f ? String.fromCharCode(c) : ''
      }
      mimetype = s
    }
    n++
    if (flags & 0x08) break
    const next = dataStart + compSize
    if (next <= pos) break
    pos = next
  }

  const eocdStart = Math.max(0, fileSize - 65557)
  for (let i = fileSize - 22; i >= eocdStart; i--) {
    if (view.u32(i, true) !== 0x06054b50) continue
    const total = view.u16(i + 10, true)
    const cdOff = view.u32(i + 16, true)
    if (total === 0 || cdOff === 0 || cdOff >= fileSize) break
    let p = cdOff
    for (let e = 0; e < total && e < 65535; e++) {
      if (view.u32(p, true) !== 0x02014b50) break
      const nameLen = view.u16(p + 28, true)
      const extraLen = view.u16(p + 30, true)
      const cmtLen = view.u16(p + 32, true)
      if (nameLen > 0 && nameLen <= 1024) {
        let name = ''
        for (let j = 0; j < nameLen; j++) {
          const c = view.u8(p + 46 + j)
          name += c >= 0x20 && c < 0x7f ? String.fromCharCode(c) : ''
        }
        add(name)
        if (name === 'mimetype' && !mimetype) {
          // content lives in local header; keep name only
        }
      }
      fromCd = true
      p += 46 + nameLen + extraLen + cmtLen
    }
    break
  }

  return {
    names,
    mimetype,
    source: fromCd ? (n > 0 ? 'mixed' : 'central-directory') : 'local',
  }
}

function classifyZip(info: ZipNames): { name: string; mime: string; suffix: string; platform: string | null; notes: string[] } {
  const names = info.names
  const has = (n: string) => names.includes(n)
  const hasPrefix = (p: string) => names.some(n => n.startsWith(p))
  const notes: string[] = []

  const hasManifest = has('AndroidManifest.xml')
  const hasDex = names.some(n => /^classes\d*\.dex$/.test(n))
  const hasResources = has('resources.arsc')
  const hasResDir = hasPrefix('res/')
  const hasNativeLib = names.some(n => /^lib\/[^/]+\/.+\.so$/.test(n))
  const hasClassesJar = has('classes.jar')
  const hasAgpMeta = has('META-INF/com/android/build/gradle/app-metadata.properties')
  const hasBundleConfig = has('BundleConfig.pb')

  if (hasBundleConfig || hasPrefix('base/dex/') || hasPrefix('base/manifest/')) {
    notes.push('BundleConfig.pb')
    return { name: 'AAB (Android App Bundle)', mime: 'application/vnd.android.aab', suffix: ', Android App Bundle', platform: 'Android', notes }
  }

  const androidSignals = [hasDex, hasResources, hasResDir, hasNativeLib].filter(Boolean).length
  const isApk =
    !hasClassesJar &&
    ((hasManifest && androidSignals > 0) ||
      (hasAgpMeta && androidSignals > 0) ||
      (hasDex && (hasResources || hasResDir)) ||
      (hasNativeLib && hasResDir && (hasManifest || hasAgpMeta || hasDex || hasResources)))

  if (hasManifest && hasClassesJar) {
    notes.push('AndroidManifest.xml', 'classes.jar')
    return { name: 'AAR (Android library)', mime: 'application/vnd.android.aar', suffix: ', Android library archive', platform: 'Android', notes }
  }

  if (isApk) {
    if (hasManifest) notes.push('AndroidManifest.xml')
    if (hasAgpMeta) notes.push('app-metadata.properties')
    if (hasDex) notes.push(names.find(n => /^classes\d*\.dex$/.test(n)) ?? 'classes.dex')
    if (hasResources) notes.push('resources.arsc')
    if (hasNativeLib) notes.push('lib/<abi>/')
    return { name: 'APK (Android)', mime: 'application/vnd.android.package-archive', suffix: ', Android application package', platform: 'Android', notes }
  }

  if (info.mimetype === 'application/epub+zip' || (has('mimetype') && info.mimetype)) {
    const mt = info.mimetype
    if (mt === 'application/epub+zip') {
      return { name: 'epub', mime: 'application/epub+zip', suffix: ', epub document', platform: null, notes: [mt] }
    }
    if (mt.startsWith('application/vnd.oasis.opendocument')) {
      return { name: 'ODF', mime: mt, suffix: ', OpenDocument', platform: null, notes: [mt] }
    }
    return { name: 'epub / ODF', mime: mt || 'application/epub+zip', suffix: ', epub/ODF container', platform: null, notes: mt ? [mt] : [] }
  }
  if (has('mimetype')) {
    return { name: 'epub / ODF', mime: 'application/epub+zip', suffix: ', epub/ODF container', platform: null, notes: [] }
  }

  if (hasPrefix('word/')) {
    return { name: 'docx (Word)', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', suffix: ', Office Open XML (docx)', platform: null, notes: [] }
  }
  if (hasPrefix('xl/')) {
    return { name: 'xlsx (Excel)', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', suffix: ', Office Open XML (xlsx)', platform: null, notes: [] }
  }
  if (hasPrefix('ppt/')) {
    return { name: 'pptx (PowerPoint)', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', suffix: ', Office Open XML (pptx)', platform: null, notes: [] }
  }

  if (names.some(n => n.endsWith('.apk'))) {
    return { name: 'XAPK / APK pack', mime: 'application/zip', suffix: ', contains .apk', platform: 'Android', notes: [] }
  }

  const hasClassFiles = names.some(n => n.endsWith('.class'))
  if (has('META-INF/MANIFEST.MF') && (hasClassFiles || names.some(n => n.endsWith('.jar')))) {
    return { name: 'JAR (Java)', mime: 'application/java-archive', suffix: ', Java archive', platform: 'JVM', notes: ['META-INF/MANIFEST.MF'] }
  }
  if (hasClassFiles && hasPrefix('META-INF/')) {
    return { name: 'JAR (Java)', mime: 'application/java-archive', suffix: ', Java archive', platform: 'JVM', notes: [] }
  }

  return { name: 'zip', mime: 'application/zip', suffix: '', platform: null, notes }
}

// ---------- Media ----------

function tryParseMedia(head: Uint8Array): PartialReport | null {
  if (startsWith(head, [0x52, 0x49, 0x46, 0x46]) && head.length >= 12) {
    const form = ascii(head, 8, 4)
    if (form === 'WAVE') {
      return {
        summary: 'RIFF WAVE audio',
        format: 'WAV',
        mime: 'audio/wav',
        category: 'media',
        platform: null,
        fields: [{ label: 'RIFF form', value: 'WAVE' }],
      }
    }
    if (form === 'AVI ') {
      return {
        summary: 'RIFF AVI video',
        format: 'AVI',
        mime: 'video/x-msvideo',
        category: 'media',
        platform: null,
        fields: [{ label: 'RIFF form', value: 'AVI' }],
      }
    }
  }

  if (startsWith(head, [0x4f, 0x67, 0x67, 0x53])) {
    let codec = ''
    const window = head.subarray(0, Math.min(head.length, 256))
    const text = String.fromCharCode(...window)
    if (text.includes('OpusHead')) codec = 'Opus'
    else if (text.includes('vorbis')) codec = 'Vorbis'
    else if (text.includes('theora')) codec = 'Theora'
    return {
      summary: `Ogg data${codec ? `, ${codec}` : ''}`,
      format: 'OGG',
      mime: 'application/ogg',
      category: 'media',
      platform: null,
      fields: [
        { label: 'capture pattern', value: 'OggS' },
        ...(codec ? [{ label: 'codec', value: codec }] : []),
      ],
    }
  }

  if (startsWith(head, [0x66, 0x4c, 0x61, 0x43])) {
    return {
      summary: 'FLAC audio bitstream data',
      format: 'FLAC',
      mime: 'audio/flac',
      category: 'media',
      platform: null,
      fields: [{ label: 'magic', value: 'fLaC' }],
    }
  }

  if (head.length >= 12 && ascii(head, 4, 4) === 'ftyp') {
    const brand = ascii(head, 8, 4)
    const brandMap: Record<string, { name: string; mime: string }> = {
      isom: { name: 'MP4', mime: 'video/mp4' },
      mp41: { name: 'MP4', mime: 'video/mp4' },
      mp42: { name: 'MP4', mime: 'video/mp4' },
      'M4A ': { name: 'M4A audio', mime: 'audio/mp4' },
      'M4B ': { name: 'M4B audiobook', mime: 'audio/mp4' },
      'qt  ': { name: 'QuickTime MOV', mime: 'video/quicktime' },
      heic: { name: 'HEIC image', mime: 'image/heic' },
      heix: { name: 'HEIC image', mime: 'image/heic' },
      avif: { name: 'AVIF image', mime: 'image/avif' },
      '3gp4': { name: '3GPP video', mime: 'video/3gpp' },
      '3gp5': { name: '3GPP video', mime: 'video/3gpp' },
      '3g2a': { name: '3GPP2 video', mime: 'video/3gpp2' },
    }
    const info = brandMap[brand] ?? { name: `ISO BMFF (${brand})`, mime: 'video/mp4' }
    const isImage = info.mime.startsWith('image/')
    return {
      summary: `${info.name} data${brand ? `, brand "${brand.trim()}"` : ''}`,
      format: info.name,
      mime: info.mime,
      category: isImage ? 'image' : 'media',
      platform: null,
      fields: [
        { label: 'box', value: 'ftyp' },
        { label: 'major brand', value: brand },
        { label: '类型', value: info.name },
      ],
    }
  }

  if (startsWith(head, [0x1a, 0x45, 0xdf, 0xa3])) {
    const window = head.subarray(0, Math.min(head.length, 256))
    const text = String.fromCharCode(...window)
    const isWebm = text.includes('webm')
    return {
      summary: isWebm ? 'WebM video' : 'Matroska video',
      format: isWebm ? 'WebM' : 'Matroska',
      mime: isWebm ? 'video/webm' : 'video/x-matroska',
      category: 'media',
      platform: null,
      fields: [{ label: 'EBML', value: '1A 45 DF A3' }],
    }
  }

  if (startsWith(head, [0x49, 0x44, 0x33])) {
    return {
      summary: 'Audio file with ID3v2 metadata (likely MP3)',
      format: 'MP3/ID3',
      mime: 'audio/mpeg',
      category: 'media',
      platform: null,
      fields: [{ label: 'ID3', value: `v2.${head[3]}.${head[4]}` }],
    }
  }

  return null
}

// ---------- Documents & other ----------

function tryParseDocuments(head: Uint8Array): PartialReport | null {
  const pdfIdx = indexOfBytes(head, [0x25, 0x50, 0x44, 0x46, 0x2d], 0, 1024)
  if (pdfIdx >= 0) {
    const ver = ascii(head, pdfIdx + 5, 3)
    return {
      summary: `PDF document, version ${ver}`,
      format: 'PDF',
      mime: 'application/pdf',
      category: 'document',
      platform: null,
      fields: [
        { label: 'header', value: `%PDF-${ver}` },
        ...(pdfIdx > 0 ? [{ label: 'offset', value: pdfIdx, note: 'magic 不在文件起始' }] : []),
      ],
    }
  }

  if (startsWith(head, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    return {
      summary: 'OLE 2 Compound Document (legacy MS Office)',
      format: 'OLE',
      mime: 'application/x-ole-storage',
      category: 'document',
      platform: 'Windows',
      fields: [{ label: 'magic', value: 'D0 CF 11 E0 A1 B1 1A E1' }],
    }
  }

  if (startsWith(head, [0x7b, 0x5c, 0x72, 0x74, 0x66])) {
    return {
      summary: 'Rich Text Format data',
      format: 'RTF',
      mime: 'application/rtf',
      category: 'document',
      platform: null,
      fields: [{ label: 'magic', value: '{\\rtf' }],
    }
  }

  if (startsWith(head, [0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33, 0x00])) {
    return {
      summary: 'SQLite 3.x database',
      format: 'SQLite',
      mime: 'application/vnd.sqlite3',
      category: 'document',
      platform: null,
      fields: [{ label: 'magic', value: 'SQLite format 3\\0' }],
    }
  }

  if (startsWith(head, [0x64, 0x65, 0x78, 0x0a])) {
    return {
      summary: 'Android DEX file',
      format: 'DEX',
      mime: 'application/vnd.android.dex',
      category: 'executable',
      platform: 'Android Dalvik/ART',
      fields: [{ label: 'magic', value: 'dex\\n' }, { label: '运行平台', value: 'Android' }],
    }
  }

  return null
}

function tryParseOther(head: Uint8Array): PartialReport | null {
  if (startsWith(head, [0x23, 0x21])) {
    let line = ''
    for (let i = 2; i < Math.min(head.length, 130); i++) {
      if (head[i] === 0x0a || head[i] === 0x00) break
      line += String.fromCharCode(head[i])
    }
    line = line.trim()
    const interp = line.replace(/^\/usr\/bin\/env\s+(-S\s+)?/, '')
    const scriptType = classifyShebang(interp)
    return {
      summary: `${scriptType}, ASCII text executable`,
      format: 'script',
      mime: 'text/x-shellscript',
      category: 'script',
      platform: 'POSIX',
      fields: [
        { label: 'shebang', value: `#!${line}` },
        { label: '解释器', value: interp },
      ],
    }
  }

  return null
}

function classifyShebang(interp: string): string {
  const t = interp.toLowerCase()
  if (t.includes('python')) return 'Python script'
  if (t.includes('perl')) return 'Perl script'
  if (t.includes('ruby')) return 'Ruby script'
  if (t.includes('node')) return 'Node.js script'
  if (t.includes('php')) return 'PHP script'
  if (t.includes('bash')) return 'Bash script'
  if (t.includes('zsh')) return 'Zsh script'
  if (t.includes('sh') || t === '/bin/sh') return 'POSIX shell script'
  if (t.includes('lua')) return 'Lua script'
  return 'script'
}

// ---------- Text detection ----------

function detectText(head: Uint8Array, fileSize: number): PartialReport | null {
  if (startsWith(head, [0xef, 0xbb, 0xbf])) {
    return textReport('UTF-8 Unicode (with BOM) text', 'utf-8', 'BOM: EF BB BF', fileSize)
  }
  if (startsWith(head, [0xff, 0xfe])) {
    return textReport('UTF-16, little-endian text', 'utf-16le', 'BOM: FF FE', fileSize)
  }
  if (startsWith(head, [0xfe, 0xff])) {
    return textReport('UTF-16, big-endian text', 'utf-16be', 'BOM: FE FF', fileSize)
  }

  const sample = head.subarray(0, Math.min(head.length, 8192))
  if (sample.length === 0) return null

  for (let i = 0; i < sample.length; i++) {
    if (sample[i] === 0) return null
  }

  let control = 0
  for (let i = 0; i < sample.length; i++) {
    const c = sample[i]
    if (c < 0x09 || (c >= 0x0e && c <= 0x1f && c !== 0x1b)) control++
  }
  if (control > sample.length * 0.02) return null

  try {
    const decoder = new TextDecoder('utf-8', { fatal: true })
    decoder.decode(sample)
    return textReport('UTF-8 Unicode text', 'utf-8', '', fileSize)
  } catch {
    // not valid UTF-8
  }

  let high = 0
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] >= 0x80) high++
  }
  if (high === 0) {
    return textReport('ASCII text', 'us-ascii', '', fileSize)
  }
  return textReport('Non-ISO extended-ASCII text', 'unknown', '含高位字节，非 UTF-8', fileSize)
}

function textReport(format: string, charset: string, note: string, fileSize: number): PartialReport {
  return {
    summary: format,
    format: format.split(' ')[0],
    mime: `text/plain`,
    category: 'text',
    platform: null,
    fields: [
      { label: '类型', value: format },
      { label: 'charset', value: charset },
      ...(note ? [{ label: '备注', value: note }] : []),
      { label: '文件大小', value: formatSize(fileSize) },
    ],
  }
}

function indexOfBytes(buf: Uint8Array, needle: number[], from: number, to: number): number {
  const end = Math.min(to, buf.length)
  for (let i = from; i <= end - needle.length; i++) {
    let ok = true
    for (let j = 0; j < needle.length; j++) {
      if (buf[i + j] !== needle[j]) { ok = false; break }
    }
    if (ok) return i
  }
  return -1
}

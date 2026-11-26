export function fmtBytes(n: number | undefined | null, digits = 1): string {
  if (n === undefined || n === null || !isFinite(n)) return '-'
  const abs = Math.abs(n)
  if (abs < 1024) return `${Math.round(n)} B`
  if (abs < 1024 * 1024) return `${(n / 1024).toFixed(digits)} KB`
  if (abs < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(digits)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(digits)} GB`
}

export function fmtBitrate(bps: number | undefined | null): string {
  if (bps === undefined || bps === null || !isFinite(bps) || bps <= 0) return '-'
  if (bps < 1000) return `${Math.round(bps)} bps`
  if (bps < 1_000_000) return `${(bps / 1000).toFixed(0)} kbps`
  return `${(bps / 1_000_000).toFixed(2)} Mbps`
}

export function fmtSpeed(bytesPerSec: number | undefined | null): string {
  if (bytesPerSec === undefined || bytesPerSec === null || !isFinite(bytesPerSec) || bytesPerSec <= 0) return '-'
  return `${fmtBytes(bytesPerSec)}/s`
}

export function fmtTime(s: number | undefined | null): string {
  if (s === undefined || s === null || !isFinite(s)) return '-'
  const neg = s < 0
  s = Math.abs(s)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const ss = sec < 10 && (h > 0 || m > 0) ? `0${sec.toFixed(2)}` : sec.toFixed(2)
  const body = h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss.padStart(5, '0')}` : `${m}:${ss.padStart(5, '0')}`
  return neg ? `-${body}` : body
}

export function fmtClock(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`
}

export function fmtDateShort(ts: number): string {
  const d = new Date(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export function shortUrl(u: string, max = 64): string {
  try {
    const parsed = new URL(u, location.href)
    const s = `${parsed.pathname.split('/').pop() || parsed.pathname}${parsed.search}`
    return s.length > max ? `${s.slice(0, max - 1)}…` : s
  } catch {
    return u.length > max ? `${u.slice(0, max - 1)}…` : u
  }
}

const readyStateNames = ['HAVE_NOTHING', 'HAVE_METADATA', 'HAVE_CURRENT_DATA', 'HAVE_FUTURE_DATA', 'HAVE_ENOUGH_DATA']
const networkStateNames = ['NETWORK_EMPTY', 'NETWORK_IDLE', 'NETWORK_LOADING', 'NETWORK_NO_SOURCE']

export function readyStateName(v: number): string {
  return `${v} (${readyStateNames[v] ?? '?'})`
}

export function networkStateName(v: number): string {
  return `${v} (${networkStateNames[v] ?? '?'})`
}

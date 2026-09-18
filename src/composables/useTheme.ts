import { reactive } from 'vue'

export interface ThemeColors {
  primary: string
  secondary: string
  bg: string
  'bg-card': string
  text: string
  'text-light': string
  border: string
}

export interface ThemePreset {
  name: string
  colors: ThemeColors
}

export const presets: ThemePreset[] = [
  {
    name: '天空蓝',
    colors: { primary: '#69DBF2', secondary: '#8ECAE6', bg: '#F0F9FF', 'bg-card': '#FFFFFF', text: '#2B3A4E', 'text-light': '#7A8DA0', border: '#D0E6F0' },
  },
  {
    name: '暖珊瑚',
    colors: { primary: '#E07A5F', secondary: '#F2CC8F', bg: '#FFF8F0', 'bg-card': '#FFFFFF', text: '#3D405B', 'text-light': '#8184A1', border: '#E8DDD0' },
  },
  {
    name: '薄荷绿',
    colors: { primary: '#52B788', secondary: '#95D5B2', bg: '#F0FFF4', 'bg-card': '#FFFFFF', text: '#2D3A30', 'text-light': '#7A8D80', border: '#D0E8D8' },
  },
  {
    name: '薰衣草',
    colors: { primary: '#B5838D', secondary: '#D4A5A5', bg: '#FFF5F7', 'bg-card': '#FFFFFF', text: '#3D2B30', 'text-light': '#8A7078', border: '#E8D0D4' },
  },
  {
    name: '琥珀',
    colors: { primary: '#E09F3E', secondary: '#F2CC8F', bg: '#FFFBF0', 'bg-card': '#FFFFFF', text: '#3D3520', 'text-light': '#8A8060', border: '#E8DCC0' },
  },
  {
    name: '深色',
    colors: { primary: '#69DBF2', secondary: '#8ECAE6', bg: '#1A2332', 'bg-card': '#243044', text: '#E0E8F0', 'text-light': '#8899AA', border: '#334455' },
  },
]

const DEFAULT = presets[0].colors

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return [r, g, b]
}

function lighten(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex)
  const lr = Math.round(r + (255 - r) * amount)
  const lg = Math.round(g + (255 - g) * amount)
  const lb = Math.round(b + (255 - b) * amount)
  return `#${[lr, lg, lb].map(v => v.toString(16).padStart(2, '0')).join('')}`
}

function applyColors(colors: ThemeColors) {
  const root = document.documentElement
  const vars: Record<string, string> = {
    '--color-primary': colors.primary,
    '--color-primary-light': lighten(colors.primary, 0.3),
    '--color-secondary': colors.secondary,
    '--color-secondary-light': lighten(colors.secondary, 0.3),
    '--color-bg': colors.bg,
    '--color-bg-card': colors['bg-card'],
    '--color-text': colors.text,
    '--color-text-light': colors['text-light'],
    '--color-border': colors.border,
  }
  for (const [k, v] of Object.entries(vars)) {
    root.style.setProperty(k, v)
  }
}

export const theme = reactive<ThemeColors>({ ...DEFAULT })

export function initTheme() {
  let initial = { ...DEFAULT }
  try {
    const saved = localStorage.getItem('theme-colors')
    if (saved) initial = { ...DEFAULT, ...JSON.parse(saved) }
  } catch {}
  Object.assign(theme, initial)
  applyColors(theme)
}

export function setThemeColors(colors: ThemeColors) {
  Object.assign(theme, colors)
  applyColors(colors)
  try { localStorage.setItem('theme-colors', JSON.stringify(colors)) } catch {}
}

export function resetTheme() {
  setThemeColors({ ...DEFAULT })
}

export function randomTheme() {
  const preset = presets[Math.floor(Math.random() * presets.length)]
  setThemeColors({ ...preset.colors })
}

import { reactive, watch } from 'vue'

export type TrailStyle = 'dot' | 'star'

export interface MouseTrailSettings {
  enabled: boolean
  style: TrailStyle
  /** 'theme' 表示跟随主题主色，否则为 #rrggbb 自定义颜色 */
  color: string
}

const STORAGE_KEY = 'mouse-trail'

const DEFAULT: MouseTrailSettings = {
  enabled: true,
  style: 'dot',
  color: 'theme',
}

export const trailSettings = reactive<MouseTrailSettings>({ ...DEFAULT })

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trailSettings))
  } catch {}
}

export function initMouseTrail() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) Object.assign(trailSettings, DEFAULT, JSON.parse(saved))
  } catch {}
  watch(trailSettings, persist)
}

export function setTrailSettings(p: Partial<MouseTrailSettings>) {
  Object.assign(trailSettings, p)
}

<script setup lang="ts">
import { ref } from 'vue'
import { theme, presets, setThemeColors, resetTheme, randomTheme, type ThemeColors } from '../composables/useTheme'
import { trailSettings, setTrailSettings, type TrailStyle } from '../composables/useMouseTrail'

const open = ref(false)

const styleOptions: { value: TrailStyle; label: string }[] = [
  { value: 'dot', label: '圆点' },
  { value: 'star', label: '星星' },
]

const colorFields: { key: keyof ThemeColors; label: string }[] = [
  { key: 'primary', label: '主色' },
  { key: 'secondary', label: '辅色' },
  { key: 'bg', label: '背景' },
  { key: 'bg-card', label: '卡片' },
  { key: 'text', label: '文字' },
  { key: 'text-light', label: '次要文字' },
  { key: 'border', label: '边框' },
]

function applyPreset(p: typeof presets[number]) {
  setThemeColors({ ...p.colors })
}

function onColor(key: keyof ThemeColors, e: Event) {
  const val = (e.target as HTMLInputElement).value
  setThemeColors({ ...theme, [key]: val })
}

function onTrailColor(e: Event) {
  setTrailSettings({ color: (e.target as HTMLInputElement).value })
}
</script>

<template>
  <button
    class="fixed bottom-6 right-6 z-50 w-11 h-11 rounded-full bg-[var(--color-primary)] text-[var(--color-bg)] border-none cursor-pointer shadow-lg flex items-center justify-center text-lg hover:scale-110 transition-transform"
    @click="open = !open"
    title="主题设置"
  >⚙</button>

  <Teleport to="body">
    <Transition name="panel">
      <div
        v-if="open"
        class="fixed inset-y-0 right-0 z-50 w-80 bg-[var(--color-bg-card)] border-l border-[var(--color-border)] shadow-2xl p-6 overflow-y-auto flex flex-col gap-5"
      >
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold text-[var(--color-text)]">主题设置</h3>
          <button class="text-[var(--color-text-light)] hover:text-[var(--color-text)] cursor-pointer bg-transparent border-none text-xl" @click="open = false">✕</button>
        </div>

        <div>
          <label class="block text-sm text-[var(--color-text-light)] mb-2">预设</label>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="p in presets"
              :key="p.name"
              class="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] text-xs cursor-pointer hover:border-[var(--color-primary)] transition-colors"
              @click="applyPreset(p)"
            >
              <span class="w-3 h-3 rounded-full" :style="{ backgroundColor: p.colors.primary }" />
              {{ p.name }}
            </button>
          </div>
        </div>

        <div class="border-t border-[var(--color-border)] pt-4">
          <label class="block text-sm text-[var(--color-text-light)] mb-3">自定义颜色</label>
          <div class="space-y-3">
            <div v-for="f in colorFields" :key="f.key" class="flex items-center gap-3">
              <input
                type="color"
                :value="theme[f.key]"
                @input="onColor(f.key, $event)"
                class="w-8 h-8 rounded border-none cursor-pointer flex-shrink-0"
              />
              <span class="text-sm text-[var(--color-text)] flex-1">{{ f.label }}</span>
              <span class="text-xs text-[var(--color-text-light)] font-mono">{{ theme[f.key] }}</span>
            </div>
          </div>
        </div>

        <div class="border-t border-[var(--color-border)] pt-4">
          <div class="flex items-center justify-between mb-3">
            <label class="block text-sm text-[var(--color-text-light)]">鼠标效果</label>
            <button
              role="switch"
              :aria-checked="trailSettings.enabled"
              class="w-10 h-6 rounded-full border-none cursor-pointer relative transition-colors"
              :class="trailSettings.enabled ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'"
              title="开启/关闭鼠标效果"
              @click="setTrailSettings({ enabled: !trailSettings.enabled })"
            >
              <span
                class="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all"
                :class="trailSettings.enabled ? 'left-[18px]' : 'left-0.5'"
              />
            </button>
          </div>

          <div class="space-y-3" :class="trailSettings.enabled ? '' : 'opacity-40 pointer-events-none'">
            <div>
              <span class="block text-xs text-[var(--color-text-light)] mb-1.5">发光点样式</span>
              <div class="flex gap-2">
                <button
                  v-for="s in styleOptions"
                  :key="s.value"
                  class="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs cursor-pointer transition-colors"
                  :class="trailSettings.style === s.value
                    ? 'border-[var(--color-primary)] bg-[var(--color-bg)] text-[var(--color-text)]'
                    : 'border-[var(--color-border)] bg-transparent text-[var(--color-text-light)] hover:border-[var(--color-primary)]'"
                  @click="setTrailSettings({ style: s.value })"
                >
                  <svg v-if="s.value === 'dot'" viewBox="0 0 16 16" class="w-4 h-4">
                    <circle cx="8" cy="8" r="4" fill="currentColor" />
                  </svg>
                  <svg v-else viewBox="0 0 16 16" class="w-4 h-4">
                    <polygon points="8,1 9.8,6 15,6 10.8,9.2 12.4,14.5 8,11.3 3.6,14.5 5.2,9.2 1,6 6.2,6" fill="currentColor" />
                  </svg>
                  {{ s.label }}
                </button>
              </div>
            </div>

            <div>
              <span class="block text-xs text-[var(--color-text-light)] mb-1.5">发光点颜色</span>
              <div class="flex items-center gap-2">
                <button
                  class="px-3 py-1.5 rounded-lg border text-xs cursor-pointer transition-colors"
                  :class="trailSettings.color === 'theme'
                    ? 'border-[var(--color-primary)] bg-[var(--color-bg)] text-[var(--color-text)]'
                    : 'border-[var(--color-border)] bg-transparent text-[var(--color-text-light)] hover:border-[var(--color-primary)]'"
                  @click="setTrailSettings({ color: 'theme' })"
                >跟随主题</button>
                <input
                  type="color"
                  :value="trailSettings.color === 'theme' ? theme.primary : trailSettings.color"
                  @input="onTrailColor"
                  class="w-8 h-8 rounded border-none cursor-pointer flex-shrink-0"
                />
                <span class="text-xs text-[var(--color-text-light)] font-mono">
                  {{ trailSettings.color === 'theme' ? theme.primary : trailSettings.color }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div class="flex gap-2 mt-auto pt-4">
          <button
            class="flex-1 px-3 py-2 rounded-lg bg-[var(--color-bg)] text-[var(--color-text)] text-sm border border-[var(--color-border)] cursor-pointer hover:border-[var(--color-primary)] transition-colors"
            @click="randomTheme"
          >随机</button>
          <button
            class="flex-1 px-3 py-2 rounded-lg bg-[var(--color-bg)] text-[var(--color-text)] text-sm border border-[var(--color-border)] cursor-pointer hover:border-[var(--color-primary)] transition-colors"
            @click="resetTheme"
          >重置</button>
        </div>
      </div>
    </Transition>

    <Transition name="fade">
      <div v-if="open" class="fixed inset-0 z-40 bg-black/20" @click="open = false" />
    </Transition>
  </Teleport>
</template>

<style scoped>
.panel-enter-active,
.panel-leave-active {
  transition: transform 0.3s ease;
}
.panel-enter-from,
.panel-leave-to {
  transform: translateX(100%);
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>

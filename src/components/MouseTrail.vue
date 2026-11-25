<script setup lang="ts">
import { computed, onBeforeUnmount, watch, ref } from 'vue'
import { trailSettings } from '../composables/useMouseTrail'

interface Particle {
  id: number
  x: number
  y: number
  size: number
  rotation: number
  opacity: number
}

/** 同屏粒子上限 */
const MAX = 12
/** 距上次生成点超过该距离才生成新粒子 */
const SPAWN_DIST = 20
/** 两次生成的最小间隔（ms），防止快速甩鼠标瞬间生成过多节点 */
const SPAWN_INTERVAL = 40

const particles = ref<Particle[]>([])

const bodyColor = computed(() =>
  trailSettings.color === 'theme' ? 'var(--color-primary)' : trailSettings.color
)
const glowColor = computed(() =>
  trailSettings.color === 'theme' ? 'var(--color-primary-light)' : `${trailSettings.color}80`
)

let nextId = 0
let lastX = 0
let lastY = 0
let lastSpawn = 0
let listening = false

function supported() {
  return (
    window.matchMedia('(pointer: fine)').matches &&
    window.matchMedia('(prefers-reduced-motion: no-preference)').matches
  )
}

function onMouseMove(e: MouseEvent) {
  const now = performance.now()
  const dx = e.clientX - lastX
  const dy = e.clientY - lastY
  if (dx * dx + dy * dy < SPAWN_DIST * SPAWN_DIST) return
  if (now - lastSpawn < SPAWN_INTERVAL) return
  lastX = e.clientX
  lastY = e.clientY
  lastSpawn = now
  if (particles.value.length >= MAX) particles.value.shift()
  particles.value.push({
    id: nextId++,
    x: e.clientX + (Math.random() - 0.5) * 40,
    y: e.clientY + (Math.random() - 0.5) * 40,
    size: Math.random() * 6 + 6,
    rotation: Math.random() * 360,
    opacity: 0.55 + Math.random() * 0.25,
  })
}

function remove(id: number) {
  const i = particles.value.findIndex(p => p.id === id)
  if (i !== -1) particles.value.splice(i, 1)
}

function attach() {
  if (listening || !supported()) return
  window.addEventListener('mousemove', onMouseMove)
  listening = true
}

function detach() {
  if (!listening) return
  window.removeEventListener('mousemove', onMouseMove)
  listening = false
}

watch(
  () => trailSettings.enabled,
  enabled => {
    if (enabled) {
      attach()
    } else {
      detach()
      particles.value = []
    }
  },
  { immediate: true }
)

onBeforeUnmount(detach)
</script>

<template>
  <div class="fixed inset-0 overflow-hidden pointer-events-none z-[100]" aria-hidden="true">
    <div
      v-for="p in particles"
      :key="p.id"
      class="trail-item"
      :style="{ transform: `translate3d(${p.x}px, ${p.y}px, 0)` }"
    >
      <div
        class="trail-dot-wrap"
        :class="trailSettings.style === 'star' ? 'trail-star' : 'trail-dot'"
        :style="{
          '--size': `${p.size}px`,
          '--rot': `${p.rotation}deg`,
          '--rot-end': `${p.rotation + 45}deg`,
          '--op0': p.opacity,
          '--c-body': bodyColor,
          '--c-glow': glowColor,
        }"
        @animationend="remove(p.id)"
      />
    </div>
  </div>
</template>

<style scoped>
.trail-item {
  position: absolute;
  top: 0;
  left: 0;
  will-change: transform;
}

.trail-dot-wrap {
  width: var(--size);
  height: var(--size);
  animation: trail-float 0.9s linear forwards;
  will-change: transform, opacity;
}

.trail-dot {
  border-radius: 50%;
  background: var(--c-body);
  box-shadow:
    0 0 calc(var(--size) * 0.6) var(--c-glow),
    0 0 calc(var(--size) * 1.4) var(--c-glow);
}

.trail-star {
  width: calc(var(--size) * 1.4);
  height: calc(var(--size) * 1.4);
  background: var(--c-body);
  clip-path: polygon(
    50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%,
    50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%
  );
  filter: drop-shadow(0 0 calc(var(--size) * 0.5) var(--c-glow));
}

@keyframes trail-float {
  0% {
    transform: translate(-50%, -50%) rotate(var(--rot));
    opacity: var(--op0);
  }
  100% {
    transform: translate(-50%, calc(-50% - 20px)) rotate(var(--rot-end));
    opacity: 0;
  }
}
</style>

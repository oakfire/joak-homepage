import {
  defineConfig,
  presetWind3,
} from 'unocss'

export default defineConfig({
  presets: [
    presetWind3(),
  ],
  theme: {
    colors: {
      primary: 'var(--color-primary, #69DBF2)',
      'primary-light': 'var(--color-primary-light, #A0E8F8)',
      secondary: 'var(--color-secondary, #8ECAE6)',
      'secondary-light': 'var(--color-secondary-light, #B8DEF0)',
      bg: 'var(--color-bg, #F0F9FF)',
      'bg-card': 'var(--color-bg-card, #FFFFFF)',
      text: 'var(--color-text, #2B3A4E)',
      'text-light': 'var(--color-text-light, #7A8DA0)',
      border: 'var(--color-border, #D0E6F0)',
    },
  },
})

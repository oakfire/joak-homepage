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
      primary: '#E07A5F',
      'primary-light': '#F0A08A',
      secondary: '#F2CC8F',
      'secondary-light': '#F7DDB3',
      bg: '#FFF8F0',
      'bg-card': '#FFFFFF',
      text: '#3D405B',
      'text-light': '#8184A1',
      border: '#E8DDD0',
    },
  },
})

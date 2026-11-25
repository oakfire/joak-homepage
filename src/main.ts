import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { initTheme } from './composables/useTheme'
import { initMouseTrail } from './composables/useMouseTrail'
import 'virtual:uno.css'
import './style.css'

initTheme()
initMouseTrail()

createApp(App).use(router).mount('#app')

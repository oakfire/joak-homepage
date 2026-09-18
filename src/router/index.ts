import { createRouter, createWebHistory } from 'vue-router'
import { tools } from '../tools/registry'

const routes = [
  {
    path: '/',
    name: 'home',
    component: () => import('../views/Home.vue'),
  },
  ...tools.map(tool => ({
    path: `/tool/${tool.id}`,
    name: `tool-${tool.id}`,
    component: () => import('../views/ToolPage.vue'),
    props: { toolId: tool.id },
  })),
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router

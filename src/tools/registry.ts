import type { Component } from 'vue'

export interface Tool {
  id: string
  name: string
  icon: string
  description: string
  component: () => Promise<Component>
}

export const tools: Tool[] = [
  {
    id: 'json-formatter',
    name: 'JSON 格式化',
    icon: '{ }',
    description: '格式化、压缩、校验 JSON',
    component: () => import('./json-formatter/index.vue'),
  },
  {
    id: 'base64',
    name: 'Base64',
    icon: 'B64',
    description: 'Base64 编码与解码',
    component: () => import('./base64/index.vue'),
  },
  {
    id: 'color-picker',
    name: '颜色选择器',
    icon: '🎨',
    description: '取色与格式转换',
    component: () => import('./color-picker/index.vue'),
  },
  {
    id: 'regex-tester',
    name: '正则测试',
    icon: '.*',
    description: '正则表达式测试与匹配',
    component: () => import('./regex-tester/index.vue'),
  },
  {
    id: 'timestamp',
    name: '时间戳转换',
    icon: '⏱',
    description: 'Unix 时间戳与日期互转',
    component: () => import('./timestamp/index.vue'),
  },
]

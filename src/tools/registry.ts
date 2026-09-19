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
    icon: 'i-lucide-braces',
    description: '格式化、压缩、校验 JSON',
    component: () => import('./json-formatter/index.vue'),
  },
  {
    id: 'base64',
    name: 'Base64',
    icon: 'i-lucide-binary',
    description: 'Base64 编码与解码',
    component: () => import('./base64/index.vue'),
  },
  {
    id: 'color-picker',
    name: '颜色选择器',
    icon: 'i-lucide-palette',
    description: '取色与格式转换',
    component: () => import('./color-picker/index.vue'),
  },
  {
    id: 'regex-tester',
    name: '正则测试',
    icon: 'i-lucide-text-search',
    description: '正则表达式测试与匹配',
    component: () => import('./regex-tester/index.vue'),
  },
  {
    id: 'timestamp',
    name: '时间戳转换',
    icon: 'i-lucide-clock',
    description: 'Unix 时间戳与日期互转',
    component: () => import('./timestamp/index.vue'),
  },
  {
    id: 'h264-sps-parser',
    name: 'H264 SPS 解析',
    icon: 'i-lucide-video',
    description: '解析 H.264 SPS NALU 参数',
    component: () => import('./h264-sps-parser/index.vue'),
  },
]

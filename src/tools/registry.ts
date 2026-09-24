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
  {
    id: 'ascii-table',
    name: 'ASCII 码表',
    icon: 'i-lucide-table-2',
    description: '查看 ASCII 字符编码表',
    component: () => import('./ascii-table/index.vue'),
  },
  {
    id: 'file-hash',
    name: '文件哈希',
    icon: 'i-lucide-hash',
    description: '计算 CRC/MD5/SHA 哈希值等',
    component: () => import('./file-hash/index.vue'),
  },
  {
    id: 'base-converter',
    name: '进制转换',
    icon: 'i-lucide-calculator',
    description: '数字进制转换（2/8/10/16）',
    component: () => import('./base-converter/index.vue'),
  },
  {
    id: 'file-inspector',
    name: '文件类型检测',
    icon: 'i-lucide-file-search',
    description: '检测文件类型与运行平台架构',
    component: () => import('./file-inspector/index.vue'),
  },
  {
    id: 'led-marquee',
    name: 'LED 跑马灯',
    icon: 'i-lucide-siren',
    description: '跑马灯/警示灯/Matrix屏保',
    component: () => import('./led-marquee/index.vue'),
  },
]

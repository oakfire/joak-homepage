# AGENTS.md

## Project

Vue 3 个人主页 — 静态部署，包含外部链接区和工具区（可路由的独立工具页面）。

## Tech Stack

- Vue 3 + Composition API + `<script setup>` + TypeScript
- Vite 6
- Vue Router 4
- UnoCSS（原子化，无 UI 库）
- npm
- `vite build` 输出纯静态文件

## Commands

```bash
npm run dev       # 开发服务器
npm run build     # 生产构建（输出 dist/）
npm run preview   # 预览构建产物
```

## Project Structure

```
src/
  main.ts
  App.vue
  router/index.ts          # 路由配置，工具路由从 registry 动态生成
  views/Home.vue            # 主页：链接 + 工具卡片网格
  components/               # Header, LinkBar, ToolGrid, ThemePanel
  composables/useTheme.ts   # 主题状态管理，CSS 变量驱动
  tools/
    registry.ts             # 工具注册表（添加工具的唯一入口）
    json-formatter/
    base64/
    color-picker/
    regex-tester/
    timestamp/
    h264-sps-parser/        # parser.ts (核心逻辑) + index.vue
  data/links.ts             # 链接配置
```

## Conventions

- 添加新工具：① 新建 `tools/<id>/index.vue` ② 在 `tools/registry.ts` 加一行
- 添加新链接：编辑 `data/links.ts`
- 无 UI 库 — 所有表单、按钮、布局均为手写 + UnoCSS
- 颜色通过 CSS 变量动态切换，UnoCSS 主题引用 `var(--color-xxx)`；默认值见 `uno.config.ts`
- 工具路由路径：`/tool/<tool-id>`
- 工具组件使用 `<script setup lang="ts">`

## Important

- 当用户说"参考标准""对照标准""按标准审视"等，必须从标准文档原文重新推导实现逻辑，而不是在已有代码上做局部修补。已有代码可能遗漏了标准中的字段或条件分支，只有回到源头才能发现偏差。

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
  components/               # Header, LinkBar, ToolGrid
  tools/
    registry.ts             # 工具注册表（添加工具的唯一入口）
    json-formatter/
    base64/
    color-picker/
    regex-tester/
    timestamp/
  data/links.ts             # 链接配置
```

## Conventions

- 添加新工具：① 新建 `tools/<id>/index.vue` ② 在 `tools/registry.ts` 加一行
- 添加新链接：编辑 `data/links.ts`
- 无 UI 库 — 所有表单、按钮、布局均为手写 + UnoCSS
- 暖色调：主色 `#E07A5F`、辅色 `#F2CC8F`、背景 `#FFF8F0`、文字 `#3D405B`
- 工具路由路径：`/tool/<tool-id>`
- 工具组件使用 `<script setup lang="ts">`

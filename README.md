# 声刻 SoundCut

一个隐私优先的浏览器音频剪辑器。音频解码、剪辑与 WAV 导出全部在本机浏览器完成，不上传服务器。

## 已实现

- 拖放或选择导入常见浏览器支持的音频格式
- Canvas 波形、时间刻度、点击定位与拖拽选择
- 播放/暂停、前后跳转、播放速度和时间显示
- 保留选区、删除选区、淡入、淡出、音量调节
- 撤销/重做与 WAV 导出
- 响应式编辑器界面

## 本地开发

```bash
npm install
npm run dev
```

构建验证：

```bash
npm run build
```

## Cloudflare Pages

首次手动部署：

```bash
npx wrangler login
npm run build
npx wrangler pages project create soundcut-web
npx wrangler pages deploy dist --project-name=soundcut-web
```

仓库也包含 GitHub Actions。请在 GitHub 仓库 Secrets 中配置 `CLOUDFLARE_API_TOKEN` 与 `CLOUDFLARE_ACCOUNT_ID`，之后推送到 `main` 会自动部署。

## 技术说明

项目使用 React、TypeScript、Vite、Web Audio API 与 Canvas。当前导出为未压缩 WAV；MP3/AAC 编码与多轨混音可在后续通过 WebAssembly 扩展。

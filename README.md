# 声刻 SoundCut

一个隐私优先的浏览器音频剪辑器。音频解码、剪辑与 WAV 导出全部在本机浏览器完成，不上传服务器。

## 已实现

- 拖放或选择导入常见浏览器支持的音频格式
- Canvas 波形、时间刻度、点击定位与拖拽选择
- 播放/暂停、前后跳转、播放速度和时间显示
- 保留选区、删除选区、淡入、淡出、音量调节
- 撤销/重做与 WAV 导出
- Cloudflare Workers AI 多语言语音识别
- 两分钟自动分片、带时间戳文字编辑
- TXT、SRT、VTT 字幕导出
- 可逐行编辑、复制完整歌词，并导出 LRC 歌词文件
- 导入 MP4、WebM、MOV 等视频并在浏览器本地提取音轨
- 视频画面预览与音频时间轴同步播放、暂停、定位和倍速
- 视频画面位于右侧独立监看区；中央仅显示统一高度的多条音频轨道，共用时间尺、贯穿播放线与移动时间标签
- 总控、轨道、片段三级速度与音量控制，调整同步应用到播放和混合导出
- 每条轨道可“铺开/收起”波形编辑高度，动态新增的音频轨道支持删除
- 麦克风录音带计时与权限提示，停止后自动解码并加入新音轨
- 轨道和片段支持儿童感、老年感、机器人、女声感、卡通高音、猴王戏曲感、憨厚低音、喜剧男声等通用变声预设
- 右上视频监看区支持网络媒体直链播放；允许跨域读取的 MP4/WebM/MOV 可提取原声，HLS 可在浏览器原生支持时播放
- 正式视频轨：视频素材进入时间线，原声保留在视频轨；可点击“提取到主音轨”继续剪辑、识别文字或导出，也可点击“隔离原声”单独试听
- 导出 WAV、MP3、M4A/AAC、FLAC、OGG 多种音频格式
- 歌曲模式：关闭语音过滤并使用 30 秒切片，改善歌词完整度
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

### 开启 AI 文字识别

项目使用 Pages Function `functions/api/transcribe.js` 调用 Cloudflare Workers AI。部署后需要添加 AI binding：

1. 打开 Cloudflare 控制台中的 Pages 项目。
2. 进入 **Settings → Bindings**。
3. 点击 **Add binding → Workers AI**。
4. Variable name 填写 `AI`。
5. 保存后重新部署最新的 GitHub commit。

`wrangler.jsonc` 中也已经声明了同名 binding。识别使用 `@cf/openai/whisper-large-v3-turbo`，默认自动检测语言，也可以在界面中手动选择语言。

普通剪辑仍然只在本机完成。只有用户主动点击“开始识别”时，浏览器才会把两分钟一段的临时 WAV 发送到 Pages Function；项目不会持久保存音频。

## 技术说明

项目使用 React、TypeScript、Vite、Web Audio API 与 Canvas。当前导出为未压缩 WAV；MP3/AAC 编码与多轨混音可在后续通过 WebAssembly 扩展。

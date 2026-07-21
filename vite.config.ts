import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({ plugins: [react(), {
  name: 'split-large-ffmpeg-wasm',
  generateBundle(_options, bundle) {
    for (const [fileName, entry] of Object.entries(bundle)) {
      if (entry.type !== 'asset' || !fileName.endsWith('.wasm')) continue
      const bytes = typeof entry.source === 'string' ? new TextEncoder().encode(entry.source) : new Uint8Array(entry.source)
      const middle = Math.ceil(bytes.length / 2)
      delete bundle[fileName]
      this.emitFile({ type: 'asset', fileName: `${fileName}.part0`, source: bytes.slice(0, middle) })
      this.emitFile({ type: 'asset', fileName: `${fileName}.part1`, source: bytes.slice(middle) })
    }
  },
}] })

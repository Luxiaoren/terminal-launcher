import { defineConfig } from 'electron-vite'
import { resolve } from 'path'

export default defineConfig({
  main: {
    build: {
      outDir: 'out/main',
      rollupOptions: {
        external: ['node-pty']
      }
    }
  },
  preload: {
    build: {
      outDir: 'out/preload'
    }
  },
  renderer: {
    root: 'src/renderer',
    build: {
      outDir: '../../out/renderer',
      rollupOptions: {
        input: {
          welcome: resolve(__dirname, 'src/renderer/pages/welcome.html'),
          workspace: resolve(__dirname, 'src/renderer/pages/workspace.html')
        }
      }
    }
  }
})

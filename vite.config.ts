import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'
import { resolve, join, relative } from 'path'
import { readdirSync, statSync, readFileSync, existsSync } from 'fs'

const MIME: Record<string, string> = {
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
}
function mimeFor(file: string): string {
  const ext = file.slice(file.lastIndexOf('.'))
  return MIME[ext] || 'application/octet-stream'
}

function getGitCommitHash(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
  } catch (error) {
    return 'unknown'
  }
}

/**
 * Serves the top-level lang/ directory as static assets at /lang/ during dev,
 * and copies its files into the build output so runtime fetch('/lang/...') works.
 */
function langPlugin(): Plugin {
  const langRoot = resolve(__dirname, 'lang')

  function collectFiles(dir: string): string[] {
    const result: string[] = []
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) {
        result.push(...collectFiles(full))
      } else {
        result.push(full)
      }
    }
    return result
  }

  return {
    name: 'serve-lang',

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith('/lang/')) return next()
        const filePath = resolve(langRoot, req.url.slice('/lang/'.length).split('?')[0])
        if (!filePath.startsWith(langRoot) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
          return next()
        }
        const mime = mimeFor(filePath)
        res.setHeader('Content-Type', mime)
        res.end(readFileSync(filePath))
      })
    },

    generateBundle() {
      for (const file of collectFiles(langRoot)) {
        const rel = relative(langRoot, file)
        this.emitFile({
          type: 'asset',
          fileName: `lang/${rel}`,
          source: readFileSync(file),
        })
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), langPlugin()],
  define: {
    __GIT_COMMIT_HASH__: JSON.stringify(getGitCommitHash()),
  },
  server: {
    host: '0.0.0.0',
    port: 3100,
    proxy: {
      '/api': {
        target: 'http://localhost:3101',
        changeOrigin: true,
      }
    }
  }
})

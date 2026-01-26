import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'

// Get git commit hash
function getGitCommitHash(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
  } catch (error) {
    return 'unknown'
  }
}

export default defineConfig({
  plugins: [react()],
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


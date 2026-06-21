import { spawn, execSync } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const PORT = Number(process.env.MARKET_API_PORT || process.env.PORT || 8787)
const HOST = process.env.HOST || '127.0.0.1'

function isPortFree(port, host) {
  return new Promise(resolve => {
    const tester = net.createServer()
      .once('error', () => resolve(false))
      .once('listening', () => tester.close(() => resolve(true)))
      .listen(port, host)
  })
}

function freePort(port) {
  try {
    if (process.platform === 'win32') {
      const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] })
      const pids = new Set()
      for (const line of out.split('\n')) {
        if (!line.includes('LISTENING')) continue
        const pid = line.trim().split(/\s+/).pop()
        if (pid && pid !== '0') pids.add(pid)
      }
      for (const pid of pids) {
        try { execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' }) } catch { /* ignore */ }
      }
      return pids.size > 0
    }
    execSync(`lsof -ti :${port} | xargs kill -9 2>/dev/null || true`, { stdio: 'ignore', shell: true })
    return true
  } catch {
    return false
  }
}

async function ensurePort() {
  if (await isPortFree(PORT, HOST)) return
  console.warn(`Port ${HOST}:${PORT} is in use — stopping the previous backend…`)
  freePort(PORT)
  await new Promise(r => setTimeout(r, 500))
  if (!(await isPortFree(PORT, HOST))) {
    console.error(`Could not free port ${PORT}. Stop the other process manually, or run:`)
    console.error(`  $env:MARKET_API_PORT=8788; npm run dev:full`)
    process.exit(1)
  }
}

let backend
let frontend

function shutdown(code = 0) {
  if (backend && !backend.killed) backend.kill()
  if (frontend && !frontend.killed) frontend.kill()
  process.exit(code)
}

await ensurePort()

backend = spawn('node', ['backend/server.mjs'], { cwd: root, stdio: 'inherit', shell: true, env: { ...process.env, PORT: String(PORT), MARKET_API_PORT: String(PORT) } })
frontend = spawn(npm, ['run', 'dev'], { cwd: root, stdio: 'inherit', shell: true })

backend.on('exit', (code) => {
  if (code && code !== 0) {
    console.error(`Backend exited with code ${code}`)
    shutdown(code)
  }
})

frontend.on('exit', (code) => shutdown(code ?? 0))

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
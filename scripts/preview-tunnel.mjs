import { spawn } from 'node:child_process'
import localtunnel from 'localtunnel'

const port = Number(process.env.PORT || 4173)
const host = process.env.HOST || '127.0.0.1'

function startPreviewServer() {
  return spawn(
    'node',
    ['scripts/run-backend.mjs', '--host', host, '--port', String(port)],
    { stdio: 'inherit', shell: true }
  )
}

async function main() {
  const preview = startPreviewServer()
  const tunnel = await localtunnel({ port })

  console.log('\nTemporary public preview URL: ' + tunnel.url)
  console.log('Press Ctrl+C to stop both the dev server and tunnel.\n')

  const shutdown = async () => {
    try {
      await tunnel.close()
    } catch {}
    try {
      preview.kill()
    } catch {}
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
  preview.on('exit', shutdown)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

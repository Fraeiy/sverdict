const args = process.argv.slice(2)

for (let index = 0; index < args.length; index += 1) {
  const current = args[index]
  const next = args[index + 1]

  if (current === '--host' && next) {
    process.env.HOST = next
    index += 1
    continue
  }

  if (current === '--port' && next) {
    process.env.PORT = next
    index += 1
  }
}

await import('../backend/server.mjs')
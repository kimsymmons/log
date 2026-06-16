// `npm run dev` — start the Vite front end AND the Express backend together so
// opening http://localhost:5173 shows the canvas with no extra steps. The
// backend runs with NODE_ENV=development, which enables POST /auth/dev-token;
// the front end auto-mints a token from it on first load (see useDevAuth).
import { spawn } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sh = (cmd, args, opts = {}) => spawn(cmd, args, { stdio: 'inherit', cwd: root, ...opts })

// 1) Compile the server, then drop the CommonJS marker (the repo is type:module,
//    but the server compiles to CJS).
const build = sh('npm', ['run', 'build:server'])
build.on('exit', (code) => {
  if (code !== 0) process.exit(code)
  writeFileSync(join(root, 'dist/server/package.json'), '{"type":"commonjs"}')

  // 2) Run backend (dev mode) + Vite concurrently.
  const envFlag = existsSync(join(root, '.env')) ? ['--env-file=.env'] : []
  const server = sh('node', [...envFlag, 'dist/server/main.js'], {
    env: { ...process.env, NODE_ENV: 'development', PORT: process.env.PORT || '3001' },
  })
  const vite = sh('npx', ['vite'])

  let stopping = false
  const stop = () => {
    if (stopping) return
    stopping = true
    server.kill()
    vite.kill()
    process.exit()
  }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
  server.on('exit', stop)
  vite.on('exit', stop)
})

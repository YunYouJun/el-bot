import type { DeviceStore } from './auth'
import { chmod, lstat, unlink } from 'node:fs/promises'
import { createServer, request } from 'node:http'
import process from 'node:process'
import { json } from './http'

/** Only the host OS account can mint pairing codes or administer devices. */
export async function adminSocket(path: string, devices: DeviceStore) {
  try {
    const entry = await lstat(path)
    if (!entry.isSocket() || (process.getuid && entry.uid !== process.getuid()))
      throw new Error('Mobile admin socket path is not an owned socket')
    const active = await new Promise<boolean>((resolve) => {
      const req = request({ socketPath: path, path: '/health', timeout: 1500 }, (res) => {
        res.resume()
        resolve(true)
      })
      req.on('timeout', () => req.destroy())
      req.on('error', error => resolve((error as NodeJS.ErrnoException).code !== 'ECONNREFUSED'))
      req.end()
    })
    if (active)
      throw new Error('A mobile admin instance already owns this profile')
    await unlink(path)
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      throw error
  }
  const server = createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/health') {
        json(res, 200, { ok: true })
      }
      else if (req.method === 'POST' && req.url === '/pair') {
        json(res, 200, await devices.createPairing())
      }
      else if (req.method === 'GET' && req.url === '/devices') {
        json(res, 200, { devices: devices.list() })
      }
      else if (req.method === 'DELETE' && /^\/devices\/[a-f0-9-]{36}$/.test(req.url ?? '')) {
        await devices.revoke(req.url!.slice('/devices/'.length))
        json(res, 200, { ok: true })
      }
      else { json(res, 404, { error: 'not_found' }) }
    }
    catch { json(res, 500, { error: 'admin_operation_failed' }) }
  })
  server.requestTimeout = 5000
  server.headersTimeout = 5000
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(path, () => {
      server.removeListener('error', reject)
      resolve()
    })
  })
  await chmod(path, 0o600)
  return async () => {
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    await unlink(path).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT')
        throw error
    })
  }
}

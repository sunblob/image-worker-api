import { readdir, unlink } from 'fs/promises'
import { join } from 'path'
import { redis } from '../lib/redis'
import { config } from '../config'

export async function cleanupStaleTempFiles(dir = config.tmpDir): Promise<void> {
  let files: string[]
  try {
    files = await readdir(dir)
  } catch {
    return
  }

  const now = Date.now()
  const ttlMs = config.jobTtlSeconds * 1000

  await Promise.all(
    files.map(async (filename) => {
      const filepath = join(dir, filename)
      try {
        if (now - Bun.file(filepath).lastModified < ttlMs) return

        const jobId = filename.replace(/\.[^.]+$/, '')
        const exists = await redis.exists(`job:${jobId}`)
        if (exists) return

        await unlink(filepath)
      } catch {
        // Already deleted or transient error — ignore
      }
    })
  )
}

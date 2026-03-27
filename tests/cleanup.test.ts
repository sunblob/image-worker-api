import { describe, it, expect } from 'bun:test'
import { mkdirSync } from 'fs'
import { unlink, utimes } from 'fs/promises'
import { join } from 'path'
import { cleanupStaleTempFiles } from '../src/jobs/cleanup'
import { config } from '../src/config'
const TEST_DIR = join(config.tmpDir, 'cleanup-test')

// redis connection closes with process exit

describe('cleanupStaleTempFiles', () => {
  it('deletes stale files (older than TTL, no Redis key)', async () => {
    mkdirSync(TEST_DIR, { recursive: true })
    const stalePath = join(TEST_DIR, 'stale-abc123.webp')
    await Bun.write(stalePath, 'stale')

    const old = new Date(Date.now() - 11 * 60 * 1000)
    await utimes(stalePath, old, old)

    await cleanupStaleTempFiles(TEST_DIR)

    expect(await Bun.file(stalePath).exists()).toBe(false)
  })

  it('leaves fresh files alone', async () => {
    mkdirSync(TEST_DIR, { recursive: true })
    const freshPath = join(TEST_DIR, 'fresh-xyz789.webp')
    await Bun.write(freshPath, 'fresh')

    await cleanupStaleTempFiles(TEST_DIR)

    expect(await Bun.file(freshPath).exists()).toBe(true)
    await unlink(freshPath)
  })

  it('does not throw when directory does not exist', async () => {
    await expect(cleanupStaleTempFiles('/tmp/nonexistent-dir-abc')).resolves.toBeUndefined()
  })
})

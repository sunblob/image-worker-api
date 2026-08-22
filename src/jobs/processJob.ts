import { join } from 'path'
import { updateJob } from './jobStore'
import { config } from '../config'
import { logger } from '../lib/logger'
import type { ProcessResult } from '../services/imageService'

export async function runJob(
  id: string,
  processor: () => Promise<ProcessResult>
): Promise<void> {
  try {
    const { buffer, ext, passthrough } = await processor()
    const outputPath = join(config.tmpDir, `${id}.${ext}`)
    await Bun.write(outputPath, buffer)
    await updateJob(id, {
      status: 'done',
      sizeAfter: buffer.length,
      outputPath,
      ext,
      passthrough: Boolean(passthrough),
    })
    logger.info('[job] Completed', { id, ext, sizeAfter: buffer.length, passthrough: Boolean(passthrough) })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Processing failed'
    logger.error('[job] Failed', err, { id })
    await updateJob(id, { status: 'error', error: message })
  }
}

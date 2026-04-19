import { join } from 'path'
import { updateJob } from './jobStore'
import { config } from '../config'
import { logger } from '../lib/logger'

export async function runJob(
  id: string,
  processor: () => Promise<{ buffer: Buffer; ext: string }>
): Promise<void> {
  try {
    const { buffer, ext } = await processor()
    const outputPath = join(config.tmpDir, `${id}.${ext}`)
    await Bun.write(outputPath, buffer)
    await updateJob(id, { status: 'done', sizeAfter: buffer.length, outputPath, ext })
    logger.info('[job] Completed', { id, ext, sizeAfter: buffer.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Processing failed'
    logger.error('[job] Failed', err, { id })
    await updateJob(id, { status: 'error', error: message })
  }
}

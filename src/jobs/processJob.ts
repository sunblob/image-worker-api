import { join } from 'path'
import { updateJob } from './jobStore'
import { config } from '../config'

export async function runJob(
  id: string,
  processor: () => Promise<{ buffer: Buffer; ext: string }>
): Promise<void> {
  try {
    const { buffer, ext } = await processor()
    const outputPath = join(config.tmpDir, `${id}.${ext}`)
    await Bun.write(outputPath, buffer)
    await updateJob(id, { status: 'done', sizeAfter: buffer.length, outputPath, ext })
  } catch (err) {
    await updateJob(id, {
      status: 'error',
      error: err instanceof Error ? err.message : 'Processing failed',
    })
  }
}

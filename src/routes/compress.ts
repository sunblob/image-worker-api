import { Elysia, t } from 'elysia'
import { randomUUID } from 'crypto'
import { compressBuffer } from '../services/imageService'
import { createJob } from '../jobs/jobStore'
import { runJob } from '../jobs/processJob'
import { config } from '../config'
import type { CompressOptions } from '../types'

const SUPPORTED_EXTS = new Set([
  'jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'tiff', 'tif', 'svg', 'heic', 'heif',
])

export const compressRoute = new Elysia()
  .post(
    '/compress',
    async ({ body }) => {
      const files = Array.isArray(body.files) ? body.files : [body.files]
      const opts: CompressOptions = {
        format: body.format as CompressOptions['format'] | undefined,
        quality: body.quality ? Number(body.quality) : undefined,
      }

      const results = await Promise.allSettled(
        files.map(async (file: File) => {
          const id = randomUUID()
          const ext = file.name.split('.').pop()?.toLowerCase() ?? ''

          if (!SUPPORTED_EXTS.has(ext)) {
            return { id, filename: file.name, status: 'error' as const }
          }

          await createJob(id, {
            status: 'processing',
            originalName: file.name,
            sizeBefore: file.size,
            createdAt: Date.now(),
          })

          const buffer = Buffer.from(await file.arrayBuffer())
          runJob(id, () => compressBuffer(buffer, opts)).catch(console.error)

          return { id, filename: file.name }
        })
      )

      return {
        jobs: results.map((r) =>
          r.status === 'fulfilled'
            ? r.value
            : { id: randomUUID(), filename: 'unknown', status: 'error' as const }
        ),
      }
    },
    {
      body: t.Object({
        files: t.Union([t.File(), t.Array(t.File())]),
        format: t.Optional(t.String()),
        quality: t.Optional(t.String()),
      }),
      response: t.Object({
        jobs: t.Array(
          t.Object({
            id: t.String(),
            filename: t.String(),
            status: t.Optional(t.Literal('error')),
          })
        ),
      }),
    }
  )

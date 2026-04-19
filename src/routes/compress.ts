import { Elysia, t } from 'elysia'
import { randomUUID } from 'crypto'
import { compressBuffer, fetchRemoteImage } from '../services/imageService'
import { createJob } from '../jobs/jobStore'
import { runJob } from '../jobs/processJob'
import { logger } from '../lib/logger'
import type { CompressOptions } from '../types'

const SUPPORTED_EXTS = new Set([
  'jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'tiff', 'tif', 'svg', 'heic', 'heif', 'jxl',
])

function parseUrls(raw: unknown): string[] {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.flatMap((x) => parseUrls(x))
  if (typeof raw !== 'string') return []
  return raw
    .split(/\r?\n|,/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function filenameFromUrl(url: string): string {
  try {
    const u = new URL(url)
    const last = u.pathname.split('/').filter(Boolean).pop() ?? u.hostname
    return decodeURIComponent(last) || u.hostname
  } catch {
    return url.slice(0, 80)
  }
}

export const compressRoute = new Elysia()
  .post(
    '/compress',
    async ({ body }) => {
      const rawFiles = body.files
      const files: File[] = rawFiles
        ? Array.isArray(rawFiles) ? rawFiles : [rawFiles]
        : []

      const urls = parseUrls(body.urls)

      const opts: CompressOptions = {
        format: body.format as CompressOptions['format'] | undefined,
        quality: body.quality ? Number(body.quality) : undefined,
      }

      const fileResults = await Promise.allSettled(
        files.map(async (file: File) => {
          const id = randomUUID()
          const ext = file.name.split('.').pop()?.toLowerCase() ?? ''

          if (!SUPPORTED_EXTS.has(ext)) {
            logger.warn('[compress] Unsupported file extension', { id, filename: file.name, ext })
            return { id, filename: file.name, status: 'error' as const }
          }

          await createJob(id, {
            status: 'processing',
            originalName: file.name,
            sizeBefore: file.size,
            createdAt: Date.now(),
          })

          logger.info('[compress] File job queued', { id, filename: file.name, size: file.size, ...opts })
          const buffer = Buffer.from(await file.arrayBuffer())
          runJob(id, () => compressBuffer(buffer, opts)).catch((err: unknown) => {
            logger.error('[compress] File job failed', err, { id, filename: file.name })
          })

          return { id, filename: file.name }
        })
      )

      const urlResults = await Promise.allSettled(
        urls.map(async (url: string) => {
          const id = randomUUID()
          const filename = filenameFromUrl(url)

          try {
            new URL(url)
          } catch {
            logger.warn('[compress] Invalid URL rejected', { id, url })
            return { id, filename, status: 'error' as const }
          }

          const buffer = await fetchRemoteImage(url).catch((err: unknown) => {
            logger.error('[compress] Failed to fetch remote image', err, { id, url })
            return null
          })
          if (!buffer) {
            return { id, filename, status: 'error' as const }
          }

          await createJob(id, {
            status: 'processing',
            originalName: filename,
            sizeBefore: buffer.length,
            createdAt: Date.now(),
          })

          logger.info('[compress] URL job queued', { id, url, size: buffer.length, ...opts })
          runJob(id, () => compressBuffer(buffer, opts)).catch((err: unknown) => {
            logger.error('[compress] URL job failed', err, { id, url })
          })
          return { id, filename }
        })
      )

      const toJobs = (r: PromiseSettledResult<{ id: string; filename: string; status?: 'error' }>) => {
        if (r.status === 'rejected') {
          logger.error('[compress] Unexpected promise rejection', r.reason)
          return { id: randomUUID(), filename: 'unknown', status: 'error' as const }
        }
        return r.value
      }

      return {
        jobs: [...fileResults.map(toJobs), ...urlResults.map(toJobs)],
      }
    },
    {
      body: t.Object({
        files: t.Optional(t.Union([t.File(), t.Array(t.File())])),
        urls: t.Optional(t.Union([t.String(), t.Array(t.String())])),
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

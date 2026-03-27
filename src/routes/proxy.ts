import { Elysia, t } from 'elysia'
import { fetchAndTransform } from '../services/imageService'
import type { EditOptions } from '../types'

export const proxyRoute = new Elysia()
  .get(
    '/proxy',
    async ({ query, set }) => {
      const { url, w, h, format, q, fit, blur, sharpen, grayscale } = query

      if (!url) {
        set.status = 400
        return { error: 'url param is required' }
      }

      const opts: EditOptions = {
        width: w ? Number(w) : undefined,
        height: h ? Number(h) : undefined,
        format: format as EditOptions['format'],
        quality: q ? Number(q) : undefined,
        fit: fit as EditOptions['fit'],
        blur: blur ? Number(blur) : undefined,
        sharpen: sharpen === 'true' || undefined,
        grayscale: grayscale === 'true' || undefined,
      }

      try {
        const { buffer, contentType } = await fetchAndTransform(url, opts)
        return new Response(buffer, { headers: { 'Content-Type': contentType } })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Proxy failed'
        if (msg.includes('Non-image content type')) {
          set.status = 400
          return { error: msg }
        }
        set.status = 502
        return { error: msg }
      }
    },
    {
      query: t.Object({
        url: t.Optional(t.String()),
        w: t.Optional(t.String()),
        h: t.Optional(t.String()),
        format: t.Optional(t.String()),
        q: t.Optional(t.String()),
        fit: t.Optional(t.String()),
        blur: t.Optional(t.String()),
        sharpen: t.Optional(t.String()),
        grayscale: t.Optional(t.String()),
      }),
    }
  )

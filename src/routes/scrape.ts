import { Elysia, t } from 'elysia'
import { scrapePage, isPublicUrl } from '../services/scraperService'
import { logger } from '../lib/logger'

export const scrapeRoute = new Elysia().post(
  '/scrape',
  async ({ body, set }) => {
    if (!isPublicUrl(body.url)) {
      logger.warn('[scrape] Rejected non-public URL', { url: body.url })
      set.status = 400
      return { error: 'URL must be a public http(s) URL' }
    }

    try {
      const images = await scrapePage(body.url, {
        includeIcons: body.includeIcons,
        includeHead: body.includeHead,
        includeDataUri: body.includeDataUri,
        includeSvg: body.includeSvg,
      })
      return { images }
    } catch (err) {
      logger.error('[scrape] Failed to scrape page', err, { url: body.url })
      set.status = 502
      return { error: err instanceof Error ? err.message : 'Scrape failed' }
    }
  },
  {
    body: t.Object({
      url: t.String(),
      includeIcons: t.Optional(t.Boolean()),
      includeHead: t.Optional(t.Boolean()),
      includeDataUri: t.Optional(t.Boolean()),
      includeSvg: t.Optional(t.Boolean()),
    }),
  }
)

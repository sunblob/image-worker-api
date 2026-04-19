import { Elysia, t } from 'elysia'
import { scrapePage, isPublicUrl } from '../services/scraperService'

export const scrapeRoute = new Elysia().post(
  '/scrape',
  async ({ body, set }) => {
    if (!isPublicUrl(body.url)) {
      set.status = 400
      return { error: 'URL must be a public http(s) URL' }
    }

    try {
      const images = await scrapePage(body.url, {
        excludeIcons: body.excludeIcons,
        excludeHead: body.excludeHead,
        excludeDataUri: body.excludeDataUri,
        excludeSvg: body.excludeSvg,
      })
      return { images }
    } catch (err) {
      set.status = 502
      return { error: err instanceof Error ? err.message : 'Scrape failed' }
    }
  },
  {
    body: t.Object({
      url: t.String(),
      excludeIcons: t.Optional(t.Boolean()),
      excludeHead: t.Optional(t.Boolean()),
      excludeDataUri: t.Optional(t.Boolean()),
      excludeSvg: t.Optional(t.Boolean()),
    }),
  }
)

import { chromium, type Browser } from 'playwright'
import { spawnSync } from 'child_process'
import { logger } from '../lib/logger'

// DOM-type shims: the page.evaluate callback runs inside Chromium, but
// tsconfig lib is ESNext (no DOM). These declarations satisfy the checker.
declare const document: any
declare const getComputedStyle: any
declare const location: any
type HTMLImageElement = any
type HTMLSourceElement = any
type HTMLElement = any
type HTMLLinkElement = any
type HTMLMetaElement = any

export interface ScrapeFilters {
  excludeIcons?: boolean
  excludeHead?: boolean
  excludeDataUri?: boolean
  excludeSvg?: boolean
}

export interface ScrapedImage {
  url: string
  alt?: string
  width?: number
  height?: number
  size?: number          // bytes, from Content-Length HEAD request
  source: 'img' | 'picture' | 'css-bg' | 'meta' | 'icon'
}

const RESULT_CAP = 200
const PAGE_TIMEOUT_MS = 15_000

let browserPromise: Promise<Browser> | null = null

/** Install the Chromium binary synchronously (blocks ~30s on first run). */
function installChromium(): void {
  logger.warn('[scraper] Chromium binary missing — running "playwright install chromium --with-deps"')
  const result = spawnSync('npx', ['playwright', 'install', 'chromium', '--with-deps'], {
    stdio: 'inherit',
    shell: true,
  })
  if (result.status !== 0) {
    throw new Error('playwright install chromium failed — check server permissions or disk space')
  }
  logger.info('[scraper] Chromium installed successfully')
}

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true })
      .catch(async (err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes("Executable doesn't exist") || msg.includes('executable')) {
          installChromium()
          // Retry after install
          return chromium.launch({ headless: true })
        }
        throw err
      })
      .then((b: Browser) => {
        b.on('disconnected', () => {
          logger.warn('[scraper] Browser disconnected — will relaunch on next request')
          browserPromise = null
        })
        logger.info('[scraper] Chromium browser launched')
        return b
      })
  }
  return browserPromise
}

export async function closeBrowser(): Promise<void> {
  if (!browserPromise) return
  const b = await browserPromise.catch(() => null)
  browserPromise = null
  if (b) await b.close().catch(() => {})
}

function isPrivateHost(hostname: string): boolean {
  if (!hostname) return true
  const h = hostname.toLowerCase()
  if (h === 'localhost' || h.endsWith('.localhost')) return true
  if (h === '0.0.0.0' || h === '::' || h === '[::]') return true
  // IPv4 private ranges
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])]
    if (a === 10) return true
    if (a === 127) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 0) return true
  }
  // IPv6 loopback / link-local
  if (h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd') || h === '::1' || h === '[::1]') {
    return true
  }
  return false
}

export function isPublicUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
    if (isPrivateHost(u.hostname)) return false
    return true
  } catch {
    return false
  }
}

function pickLargestSrcset(srcset: string): string | null {
  const parts = srcset.split(',').map((s) => s.trim()).filter(Boolean)
  let best: { url: string; weight: number } | null = null
  for (const part of parts) {
    const [url, descriptor] = part.split(/\s+/)
    if (!url) continue
    let weight = 1
    if (descriptor) {
      const w = descriptor.match(/^(\d+(?:\.\d+)?)(w|x)$/)
      if (w) weight = parseFloat(w[1])
    }
    if (!best || weight > best.weight) best = { url, weight }
  }
  return best?.url ?? null
}

/**
 * Fetch Content-Length for each URL via HEAD requests, up to `concurrency` in
 * parallel. Silently skips URLs that time out or return no Content-Length.
 */
async function fetchSizes(
  urls: string[],
  concurrency = 20,
): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  const queue = [...urls]

  async function worker() {
    while (queue.length > 0) {
      const url = queue.shift()!
      try {
        const res = await fetch(url, {
          method: 'HEAD',
          signal: AbortSignal.timeout(4_000),
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ImageWorker/1.0)' },
        })
        const len = res.headers.get('content-length')
        if (len) map.set(url, parseInt(len, 10))
      } catch {
        // timeout or network error — skip
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, urls.length) }, () => worker()),
  )
  return map
}

export async function scrapePage(
  targetUrl: string,
  filters: ScrapeFilters = {}
): Promise<ScrapedImage[]> {
  if (!isPublicUrl(targetUrl)) {
    throw new Error('URL must be a public http(s) URL')
  }

  logger.info('[scraper] Starting scrape', { url: targetUrl, filters })

  const browser = await getBrowser()
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (compatible; ImageWorker/1.0)',
    viewport: { width: 1280, height: 900 },
  })

  try {
    const page = await context.newPage()
    await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: PAGE_TIMEOUT_MS })

    const raw = await page.evaluate(() => {
      const out: Array<{
        url: string
        alt?: string
        width?: number
        height?: number
        source: string
        srcset?: string
      }> = []

      document.querySelectorAll('img').forEach((img: any) => {
        const el = img as HTMLImageElement
        out.push({
          url: el.currentSrc || el.src,
          alt: el.alt || undefined,
          width: el.naturalWidth || undefined,
          height: el.naturalHeight || undefined,
          source: 'img',
          srcset: el.srcset || undefined,
        })
      })

      document.querySelectorAll('picture source[srcset]').forEach((src: any) => {
        out.push({
          url: '',
          source: 'picture',
          srcset: (src as HTMLSourceElement).srcset,
        })
      })

      // CSS background images (visible elements only)
      document.querySelectorAll('*').forEach((el: any) => {
        const style = getComputedStyle(el)
        const bg = style.backgroundImage
        if (bg && bg.startsWith('url(')) {
          const match = bg.match(/url\((['"]?)(.*?)\1\)/)
          if (match && match[2]) {
            out.push({ url: match[2], source: 'css-bg' })
          }
        }
      })

      // Head meta and icons
      document.querySelectorAll('link[rel*="icon"]').forEach((link: any) => {
        const href = (link as HTMLLinkElement).href
        if (href) out.push({ url: href, source: 'icon' })
      })
      document
        .querySelectorAll('meta[property="og:image"], meta[name="twitter:image"], meta[property="og:image:url"]')
        .forEach((m: any) => {
          const content = (m as HTMLMetaElement).content
          if (content) out.push({ url: content, source: 'meta' })
        })

      return { items: out, baseUrl: location.href }
    })

    const seen = new Set<string>()
    const results: ScrapedImage[] = []

    for (const item of raw.items) {
      let url = item.url
      if (!url && item.srcset) {
        url = pickLargestSrcset(item.srcset) ?? ''
      } else if (item.srcset && item.source === 'img') {
        const larger = pickLargestSrcset(item.srcset)
        if (larger) url = larger
      }
      if (!url) continue

      try {
        url = new URL(url, raw.baseUrl).href
      } catch {
        continue
      }

      const source = (item.source === 'icon' ? 'icon' : item.source) as ScrapedImage['source']

      if (filters.excludeDataUri && url.startsWith('data:')) continue
      if (filters.excludeSvg && (url.toLowerCase().endsWith('.svg') || url.startsWith('data:image/svg'))) continue
      if (filters.excludeIcons) {
        if (source === 'icon') continue
        if (/\/favicon\.[a-z]+/i.test(url)) continue
        if (item.width && item.height && item.width < 32 && item.height < 32) continue
      }
      if (filters.excludeHead && (source === 'meta' || source === 'icon')) continue

      if (seen.has(url)) continue
      seen.add(url)

      results.push({
        url,
        alt: item.alt,
        width: item.width,
        height: item.height,
        source,
      })

      if (results.length >= RESULT_CAP) break
    }

    // Enrich with file sizes via concurrent HEAD requests
    const publicResults = results.filter((r) => !r.url.startsWith('data:'))
    const sizes = await fetchSizes(publicResults.map((r) => r.url))
    for (const img of publicResults) {
      const s = sizes.get(img.url)
      if (s) img.size = s
    }

    logger.info('[scraper] Scrape complete', { url: targetUrl, found: results.length })
    return results
  } finally {
    await context.close().catch((err: unknown) => {
      logger.warn('[scraper] Failed to close browser context', { error: String(err) })
    })
  }
}

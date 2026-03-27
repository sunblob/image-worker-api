import { describe, it, expect, mock } from 'bun:test'
import { Elysia } from 'elysia'

mock.module('../../src/services/imageService', () => ({
  fetchAndTransform: mock(async (url: string) => {
    if (url.includes('bad-type')) throw new Error('Non-image content type: text/html')
    if (url.includes('unreachable')) throw new Error('fetch failed')
    return { buffer: Buffer.from('fake-image'), contentType: 'image/webp' }
  }),
}))

const { proxyRoute } = await import('../../src/routes/proxy')
const app = new Elysia().use(proxyRoute)

describe('GET /proxy', () => {
  it('returns 400 when url param is missing', async () => {
    const res = await app.handle(new Request('http://localhost/proxy'))
    expect(res.status).toBe(400)
  })

  it('streams transformed image for valid url', async () => {
    const res = await app.handle(
      new Request('http://localhost/proxy?url=https://example.com/img.jpg&w=300&format=webp')
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/webp')
  })

  it('returns 400 for non-image content type', async () => {
    const res = await app.handle(
      new Request('http://localhost/proxy?url=https://example.com/bad-type')
    )
    expect(res.status).toBe(400)
  })

  it('returns 502 for unreachable remote URL', async () => {
    const res = await app.handle(
      new Request('http://localhost/proxy?url=https://unreachable.example.com/img.jpg')
    )
    expect(res.status).toBe(502)
  })
})

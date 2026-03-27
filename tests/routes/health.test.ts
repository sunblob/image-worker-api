import { describe, it, expect } from 'bun:test'
import { Elysia } from 'elysia'
import { healthRoute } from '../../src/routes/health'

const app = new Elysia().use(healthRoute)

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await app.handle(new Request('http://localhost/health'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
  })
})

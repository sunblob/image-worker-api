import { describe, it, expect, afterAll } from 'bun:test'
import { Elysia } from 'elysia'
import sharp from 'sharp'
import { editRoute } from '../../src/routes/edit'
import { redis } from '../../src/lib/redis'

const app = new Elysia().use(editRoute)

const testJpeg = await sharp({
  create: { width: 100, height: 100, channels: 3, background: { r: 200, g: 100, b: 50 } },
}).jpeg().toBuffer()

// redis connection closes with process exit

describe('POST /edit', () => {
  it('creates a job on first apply (file upload)', async () => {
    const form = new FormData()
    form.append('file', new Blob([testJpeg], { type: 'image/jpeg' }), 'original.jpg')
    form.append('options', JSON.stringify({ format: 'webp', quality: 75 }))

    const res = await app.handle(new Request('http://localhost/edit', {
      method: 'POST',
      body: form,
    }))

    expect(res.status).toBe(200)
    const body = await res.json() as { id: string; filename: string }
    expect(typeof body.id).toBe('string')
    expect(body.filename).toBe('original.jpg')
  })

  it('returns 400 when neither file nor sourceJobId provided', async () => {
    const form = new FormData()
    form.append('options', JSON.stringify({ format: 'webp' }))

    const res = await app.handle(new Request('http://localhost/edit', {
      method: 'POST',
      body: form,
    }))
    expect(res.status).toBe(400)
  })

  it('returns 404 for non-existent sourceJobId', async () => {
    const form = new FormData()
    form.append('sourceJobId', 'does-not-exist')
    form.append('options', JSON.stringify({ format: 'png' }))

    const res = await app.handle(new Request('http://localhost/edit', {
      method: 'POST',
      body: form,
    }))
    expect(res.status).toBe(404)
  })

  it('chains applies via sourceJobId', async () => {
    const form1 = new FormData()
    form1.append('file', new Blob([testJpeg], { type: 'image/jpeg' }), 'src.jpg')
    form1.append('options', JSON.stringify({ width: 50 }))

    const res1 = await app.handle(new Request('http://localhost/edit', {
      method: 'POST', body: form1,
    }))
    const { id: sourceId } = await res1.json() as { id: string }

    await Bun.sleep(1000)

    const form2 = new FormData()
    form2.append('sourceJobId', sourceId)
    form2.append('options', JSON.stringify({ format: 'png' }))

    const res2 = await app.handle(new Request('http://localhost/edit', {
      method: 'POST', body: form2,
    }))

    expect(res2.status).toBe(200)
    const body2 = await res2.json() as { id: string }
    expect(body2.id).not.toBe(sourceId)
  })
})

import { describe, it, expect, afterAll } from 'bun:test'
import { Elysia } from 'elysia'
import sharp from 'sharp'
import { compressRoute } from '../../src/routes/compress'
import { getJob } from '../../src/jobs/jobStore'
import { redis } from '../../src/lib/redis'

const app = new Elysia().use(compressRoute)

const testJpeg = await sharp({
  create: { width: 20, height: 20, channels: 3, background: { r: 100, g: 150, b: 200 } },
}).jpeg().toBuffer()

// redis connection closes with process exit

describe('POST /compress', () => {
  it('returns job IDs for uploaded files', async () => {
    const form = new FormData()
    form.append('files', new Blob([testJpeg], { type: 'image/jpeg' }), 'test.jpg')
    form.append('format', 'webp')
    form.append('quality', '80')

    const res = await app.handle(new Request('http://localhost/compress', {
      method: 'POST',
      body: form,
    }))

    expect(res.status).toBe(200)
    const body = await res.json() as { jobs: Array<{ id: string; filename: string }> }
    expect(body.jobs).toHaveLength(1)
    expect(typeof body.jobs[0].id).toBe('string')
    expect(body.jobs[0].filename).toBe('test.jpg')
  })

  it('creates job records in Redis and eventually marks done', async () => {
    const form = new FormData()
    form.append('files', new Blob([testJpeg], { type: 'image/jpeg' }), 'photo.jpg')

    const res = await app.handle(new Request('http://localhost/compress', {
      method: 'POST',
      body: form,
    }))
    const { jobs } = await res.json() as { jobs: Array<{ id: string }> }
    const id = jobs[0].id

    await Bun.sleep(1000)

    const job = await getJob(id)
    expect(job).not.toBeNull()
    expect(job?.status).toBe('done')
  })

  it('handles multiple files in one request', async () => {
    const form = new FormData()
    form.append('files', new Blob([testJpeg], { type: 'image/jpeg' }), 'a.jpg')
    form.append('files', new Blob([testJpeg], { type: 'image/jpeg' }), 'b.jpg')

    const res = await app.handle(new Request('http://localhost/compress', {
      method: 'POST',
      body: form,
    }))
    const body = await res.json() as { jobs: unknown[] }
    expect(body.jobs).toHaveLength(2)
  })

  it('marks unsupported file type job as error', async () => {
    const form = new FormData()
    form.append('files', new Blob(['not-an-image'], { type: 'text/plain' }), 'file.txt')

    const res = await app.handle(new Request('http://localhost/compress', {
      method: 'POST',
      body: form,
    }))
    expect(res.status).toBe(200)
    const body = await res.json() as { jobs: Array<{ status: string }> }
    expect(body.jobs[0].status).toBe('error')
  })
})

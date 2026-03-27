import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { Elysia } from 'elysia'
import { jobsRoute } from '../../src/routes/jobs'
import { createJob } from '../../src/jobs/jobStore'
import { redis } from '../../src/lib/redis'
import { mkdirSync } from 'fs'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { config } from '../../src/config'

const app = new Elysia().use(jobsRoute)

const DONE_ID = 'test-jobs-done'
const PROC_ID = 'test-jobs-proc'

beforeAll(async () => {
  mkdirSync(config.tmpDir, { recursive: true })
  const tmpPath = join(config.tmpDir, `${DONE_ID}.webp`)
  await writeFile(tmpPath, Buffer.from('fake-webp'))

  await createJob(DONE_ID, {
    status: 'done',
    originalName: 'photo.jpg',
    sizeBefore: 1000,
    sizeAfter: 400,
    outputPath: tmpPath,
    ext: 'webp',
    createdAt: Date.now(),
  })
  await createJob(PROC_ID, {
    status: 'processing',
    originalName: 'banner.png',
    sizeBefore: 2000,
    createdAt: Date.now(),
  })
})

afterAll(async () => {
  await redis.del(`job:${DONE_ID}`)
  await redis.del(`job:${PROC_ID}`)
  
})

describe('GET /jobs/:id', () => {
  it('returns job status without outputPath', async () => {
    const res = await app.handle(new Request(`http://localhost/jobs/${DONE_ID}`))
    expect(res.status).toBe(200)
    const body = await res.json() as any
    expect(body.status).toBe('done')
    expect(body.id).toBe(DONE_ID)
    expect(body.outputPath).toBeUndefined()
  })

  it('returns 404 for unknown job', async () => {
    const res = await app.handle(new Request('http://localhost/jobs/nonexistent'))
    expect(res.status).toBe(404)
  })
})

describe('GET /jobs/:id/download', () => {
  it('streams file with correct headers for done job', async () => {
    const res = await app.handle(
      new Request(`http://localhost/jobs/${DONE_ID}/download`)
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('image/webp')
    expect(res.headers.get('content-disposition')).toContain('photo.jpg')
    expect(res.headers.get('content-disposition')).toContain('.webp')
  })

  it('returns 404 for processing job', async () => {
    const res = await app.handle(
      new Request(`http://localhost/jobs/${PROC_ID}/download`)
    )
    expect(res.status).toBe(404)
  })
})

describe('GET /jobs/download', () => {
  it('/jobs/download is not captured by /jobs/:id route', async () => {
    const res = await app.handle(
      new Request(`http://localhost/jobs/download?ids=${DONE_ID}`)
    )
    expect(res.headers.get('content-type')).toBe('application/zip')
  })

  it('returns zip for done jobs', async () => {
    const res = await app.handle(
      new Request(`http://localhost/jobs/download?ids=${DONE_ID}`)
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/zip')
    expect(res.headers.get('content-disposition')).toContain('images.zip')
  })

  it('returns 400 when no done jobs found', async () => {
    const res = await app.handle(
      new Request(`http://localhost/jobs/download?ids=${PROC_ID}`)
    )
    expect(res.status).toBe(400)
  })
})

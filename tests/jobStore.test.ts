import { describe, it, expect, beforeEach, afterAll } from 'bun:test'
import { createJob, getJob, updateJob } from '../src/jobs/jobStore'
import { redis } from '../src/lib/redis'

const ID = 'test-job-store-001'

beforeEach(async () => { await redis.del(`job:${ID}`) })
afterAll(async () => { await redis.del(`job:${ID}`);  })

describe('jobStore', () => {
  it('createJob stores record in Redis', async () => {
    await createJob(ID, {
      status: 'processing',
      originalName: 'photo.jpg',
      sizeBefore: 1024,
      createdAt: Date.now(),
    })
    const job = await getJob(ID)
    expect(job).not.toBeNull()
    expect(job?.id).toBe(ID)
    expect(job?.status).toBe('processing')
    expect(job?.originalName).toBe('photo.jpg')
  })

  it('getJob returns null for unknown id', async () => {
    expect(await getJob('nonexistent-id')).toBeNull()
  })

  it('updateJob patches fields without touching others', async () => {
    await createJob(ID, {
      status: 'processing',
      originalName: 'photo.jpg',
      sizeBefore: 1024,
      createdAt: Date.now(),
    })
    await updateJob(ID, { status: 'done', sizeAfter: 512, ext: 'webp' })
    const job = await getJob(ID)
    expect(job?.status).toBe('done')
    expect(job?.sizeAfter).toBe(512)
    expect(job?.originalName).toBe('photo.jpg') // unchanged
  })

  it('updateJob is a no-op for unknown id', async () => {
    await expect(updateJob('ghost-id', { status: 'done' })).resolves.toBeUndefined()
  })
})

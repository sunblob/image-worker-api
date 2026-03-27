import { describe, it, expect, afterAll } from 'bun:test'
import { redis } from '../src/lib/redis'

// redis connection closes with process exit

describe('redis', () => {
  it('can set and get a value', async () => {
    await redis.set('test:ping', 'pong', 'EX', 5)
    const val = await redis.get('test:ping')
    expect(val).toBe('pong')
    await redis.del('test:ping')
  })
})

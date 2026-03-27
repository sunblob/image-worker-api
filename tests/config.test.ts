import { describe, it, expect } from 'bun:test'
import { config } from '../src/config'

describe('config', () => {
  it('has all required fields with correct types', () => {
    expect(typeof config.port).toBe('number')
    expect(typeof config.redisUrl).toBe('string')
    expect(typeof config.corsOrigin).toBe('string')
    expect(typeof config.tmpDir).toBe('string')
    expect(typeof config.jobTtlSeconds).toBe('number')
    expect(typeof config.maxUploadBytes).toBe('number')
  })

  it('has sensible defaults', () => {
    expect(config.port).toBe(3001)
    expect(config.jobTtlSeconds).toBe(600)
    expect(config.maxUploadBytes).toBe(52428800)
  })
})

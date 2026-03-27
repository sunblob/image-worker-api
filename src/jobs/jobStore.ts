import { redis } from '../lib/redis'
import { config } from '../config'
import type { JobRecord } from '../types'

const key = (id: string) => `job:${id}`

export async function createJob(
  id: string,
  record: Omit<JobRecord, 'id'>
): Promise<void> {
  await redis.set(key(id), JSON.stringify(record), 'EX', config.jobTtlSeconds)
}

export async function getJob(
  id: string
): Promise<(JobRecord & { id: string }) | null> {
  const raw = await redis.get(key(id))
  if (!raw) return null
  return { ...(JSON.parse(raw) as JobRecord), id }
}

export async function getJobs(
  ids: string[]
): Promise<((JobRecord & { id: string }) | null)[]> {
  if (ids.length === 0) return []
  const raws = await redis.mget(...ids.map(key))
  return raws.map((raw, i) =>
    raw ? { ...(JSON.parse(raw) as JobRecord), id: ids[i] } : null
  )
}

export async function updateJob(
  id: string,
  patch: Partial<JobRecord>
): Promise<void> {
  const existing = await getJob(id)
  if (!existing) return
  const { id: _id, ...rest } = existing
  const updated = { ...rest, ...patch }
  const ttl = await redis.ttl(key(id))
  await redis.set(
    key(id),
    JSON.stringify(updated),
    'EX',
    ttl > 0 ? ttl : config.jobTtlSeconds
  )
}

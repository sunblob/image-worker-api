export const config = {
  port: Number(process.env.PORT ?? 3001),
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:3000',
  tmpDir: process.env.TMP_DIR ?? '/tmp/imgworker',
  jobTtlSeconds: Number(process.env.JOB_TTL_SECONDS ?? 600),
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES ?? 52428800),
} as const

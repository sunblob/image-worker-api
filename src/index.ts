import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { cron } from '@elysiajs/cron'
import { mkdirSync } from 'fs'
import { healthRoute } from './routes/health'
import { compressRoute } from './routes/compress'
import { editRoute } from './routes/edit'
import { jobsRoute } from './routes/jobs'
import { proxyRoute } from './routes/proxy'
import { scrapeRoute } from './routes/scrape'
import { cleanupStaleTempFiles } from './jobs/cleanup'
import { config } from './config'

// Ensure temp directory exists before first request
mkdirSync(config.tmpDir, { recursive: true })

const app = new Elysia({ serve: { maxRequestBodySize: config.maxUploadBytes } })
  .use(cors({ origin: config.corsOrigin }))
  .use(
    cron({
      name: 'cleanup',
      pattern: '*/5 * * * *', // every 5 minutes
      run: () => cleanupStaleTempFiles(),
    })
  )
  .use(healthRoute)
  .use(jobsRoute)     // /jobs/download registered before /jobs/:id
  .use(compressRoute)
  .use(editRoute)
  .use(proxyRoute)
  .use(scrapeRoute)
  .listen(config.port)

console.log(`image-worker-api listening on port ${config.port}`)

export { app }

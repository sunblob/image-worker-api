import { Elysia, t } from 'elysia'
import { randomUUID } from 'crypto'
import { transformBuffer } from '../services/imageService'
import { createJob, getJob } from '../jobs/jobStore'
import { runJob } from '../jobs/processJob'
import { config } from '../config'
import type { EditOptions } from '../types'

export const editRoute = new Elysia()
  .post(
    '/edit',
    async ({ body, set }) => {
      const { file, sourceJobId, options: optsRaw } = body
      // Elysia may auto-parse JSON strings in form fields; handle both cases
      const opts: EditOptions = optsRaw
        ? (typeof optsRaw === 'string' ? JSON.parse(optsRaw) : optsRaw)
        : {}

      if (!file && !sourceJobId) {
        set.status = 400
        return { error: 'Either file or sourceJobId is required' }
      }

      let inputBuffer: Buffer
      let originalName: string
      let sizeBefore: number
      let originalPath: string | undefined

      if (sourceJobId) {
        const source = await getJob(sourceJobId)
        if (!source) {
          set.status = 404
          return { error: 'Source job not found or expired' }
        }
        if (source.status !== 'done') {
          set.status = 400
          return { error: 'Source job is not done yet' }
        }
        originalPath = source.originalPath
        inputBuffer = Buffer.from(await Bun.file(originalPath!).arrayBuffer())
        originalName = source.originalName
        sizeBefore = source.sizeBefore
      } else {
        const rawBuffer = Buffer.from(await file!.arrayBuffer())
        originalName = file!.name
        sizeBefore = file!.size
        inputBuffer = rawBuffer

        // Save the original file so future edits always start from it
        const ext = originalName.split('.').pop() ?? 'bin'
        const tmpId = randomUUID()
        originalPath = `${config.tmpDir}/${tmpId}_original.${ext}`
        await Bun.write(originalPath, rawBuffer)
      }

      const id = randomUUID()

      await createJob(id, {
        status: 'processing',
        originalName,
        sizeBefore,
        originalPath,
        createdAt: Date.now(),
      })

      runJob(id, () => transformBuffer(inputBuffer, opts)).catch(console.error)

      return { id, filename: originalName }
    },
    {
      body: t.Object({
        file: t.Optional(t.File()),
        sourceJobId: t.Optional(t.String()),
        options: t.Optional(t.Union([t.String(), t.Any()])),
      }),
      response: {
        200: t.Object({ id: t.String(), filename: t.String() }),
        400: t.Object({ error: t.String() }),
        404: t.Object({ error: t.String() }),
      },
    }
  )

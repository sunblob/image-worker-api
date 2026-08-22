import { Elysia, t } from 'elysia';
import archiver from 'archiver';
import { getJob, getJobs } from '../jobs/jobStore';
import type { JobResponse } from '../types';

const MIME_BY_EXT: Record<string, string> = {
  webp: 'image/webp',
  avif: 'image/avif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  png: 'image/png',
  tiff: 'image/tiff',
  tif: 'image/tiff',
  heif: 'image/heif',
  heic: 'image/heic',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
};

function mimeFor(ext: string | undefined): string {
  if (!ext) return 'application/octet-stream';
  return MIME_BY_EXT[ext.toLowerCase()] ?? `image/${ext}`;
}

/**
 * `photo.jpg` compressed to webp becomes `photo.webp`. When the output format matches what
 * the file already was — always the case for a passthrough — the original name is left alone,
 * so `photo.jpg` doesn't come back as `photo.jpeg`.
 */
function downloadName(originalName: string, ext: string | undefined): string {
  if (!ext) return originalName;
  const currentExt = originalName.match(/\.([^.]+)$/)?.[1];
  if (currentExt && mimeFor(currentExt) === mimeFor(ext)) return originalName;
  return `${originalName.replace(/\.[^.]+$/, '')}.${ext}`;
}

export const jobsRoute = new Elysia()
  .get(
    '/jobs/download',
    async ({ query, set }) => {
      const ids = (query.ids ?? '').split(',').filter(Boolean);
      const jobs = (await getJobs(ids)).filter((j) => j?.status === 'done');

      if (jobs.length === 0) {
        set.status = 400;
        return { error: 'No completed jobs found for provided IDs' };
      }

      const archive = archiver('zip', { zlib: { level: 6 } });

      for (const job of jobs) {
        archive.file(job!.outputPath!, { name: downloadName(job!.originalName, job!.ext) });
      }

      const buffer = await new Promise<Buffer>((resolve, reject) => {
        const chunks: Buffer[] = []
        archive.on('data', (chunk: Buffer) => chunks.push(chunk))
        archive.on('end', () => resolve(Buffer.concat(chunks)))
        archive.on('error', reject)
        archive.finalize()
      })

      return new Response(buffer, {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': 'attachment; filename="images.zip"',
          'Content-Length': String(buffer.length),
        },
      });
    },
    { query: t.Object({ ids: t.Optional(t.String()) }) },
  )

  .get(
    '/jobs/:id',
    async ({ params, set }) => {
      const job = await getJob(params.id);
      if (!job) {
        set.status = 404;
        return { error: 'Job not found' };
      }

      const response: JobResponse = {
        id: job.id,
        status: job.status,
        originalName: job.originalName,
        sizeBefore: job.sizeBefore,
        sizeAfter: job.sizeAfter,
        ext: job.ext,
        passthrough: job.passthrough,
        error: job.error,
        createdAt: job.createdAt,
      };
      return response;
    },
    {
      params: t.Object({ id: t.String() }),
      response: {
        200: t.Object({
          id: t.String(),
          status: t.Union([t.Literal('processing'), t.Literal('done'), t.Literal('error')]),
          originalName: t.String(),
          sizeBefore: t.Number(),
          sizeAfter: t.Optional(t.Number()),
          ext: t.Optional(t.String()),
          passthrough: t.Optional(t.Boolean()),
          error: t.Optional(t.String()),
          createdAt: t.Number(),
        }),
        404: t.Object({ error: t.String() }),
      },
    },
  )

  .get(
    '/jobs/:id/download',
    async ({ params, set }) => {
      const job = await getJob(params.id);
      if (!job || job.status !== 'done' || !job.outputPath) {
        set.status = 404;
        return { error: 'Job not ready or file missing' };
      }

      const bunFile = Bun.file(job.outputPath!);
      if (!(await bunFile.exists())) {
        set.status = 404;
        return { error: 'File not found on disk' };
      }

      const filename = downloadName(job.originalName, job.ext);
      const mime = mimeFor(job.ext);
      return new Response(bunFile, {
        headers: {
          'Content-Type': mime,
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length': String(bunFile.size),
        },
      });
    },
    {
      params: t.Object({ id: t.String() }),
    },
  );

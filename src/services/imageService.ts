import sharp from 'sharp'
import type { CompressOptions, EditOptions } from '../types'

type SharpFormat = 'webp' | 'avif' | 'jpeg' | 'png'

async function detectFormat(input: Buffer): Promise<SharpFormat> {
  const meta = await sharp(input).metadata()
  return (meta.format as SharpFormat) ?? 'jpeg'
}

export async function compressBuffer(
  input: Buffer,
  opts: CompressOptions
): Promise<{ buffer: Buffer; ext: string }> {
  const format = opts.format ?? (await detectFormat(input))
  const quality = opts.quality ?? 80
  const buffer = await sharp(input).toFormat(format, { quality }).toBuffer()
  return { buffer, ext: format }
}

export async function transformBuffer(
  input: Buffer,
  opts: EditOptions
): Promise<{ buffer: Buffer; ext: string }> {
  let pipeline = sharp(input)

  if (opts.width || opts.height) {
    pipeline = pipeline.resize(opts.width ?? null, opts.height ?? null, {
      fit: opts.fit ?? 'cover',
    })
  }
  if (opts.rotate) pipeline = pipeline.rotate(opts.rotate)
  if (opts.flip === 'horizontal') pipeline = pipeline.flop()
  if (opts.flip === 'vertical') pipeline = pipeline.flip()
  if (opts.blur) pipeline = pipeline.blur(opts.blur)
  if (opts.sharpen) pipeline = pipeline.sharpen()
  if (opts.grayscale) pipeline = pipeline.grayscale()

  const format = opts.format ?? (await detectFormat(input))
  const quality = opts.quality ?? 80
  pipeline = pipeline.toFormat(format, { quality })

  const buffer = await pipeline.toBuffer()
  return { buffer, ext: format }
}

export async function fetchAndTransform(
  url: string,
  opts: EditOptions
): Promise<{ buffer: Buffer; contentType: string }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10_000)

  let res: Response
  try {
    res = await fetch(url, { signal: controller.signal, redirect: 'follow' })
  } finally {
    clearTimeout(timeout)
  }

  if (!res.ok) throw new Error(`Remote URL returned ${res.status}`)

  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.startsWith('image/')) {
    throw new Error(`Non-image content type: ${contentType}`)
  }

  const inputBuffer = Buffer.from(await res.arrayBuffer())
  const { buffer, ext } = await transformBuffer(inputBuffer, opts)
  return { buffer, contentType: `image/${ext}` }
}

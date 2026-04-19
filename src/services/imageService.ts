import sharp from 'sharp'
import type { CompressOptions, EditOptions } from '../types'

export type SharpFormat = 'webp' | 'avif' | 'jpeg' | 'png' | 'tiff' | 'heif' | 'jxl'

const ENCODER_NAMES: Record<SharpFormat, string> = {
  webp: 'webp',
  avif: 'heif',
  jpeg: 'jpeg',
  png: 'png',
  tiff: 'tiff',
  heif: 'heif',
  jxl: 'jxl',
}

export function isFormatSupported(format: SharpFormat): boolean {
  const info = (sharp as any).format?.[ENCODER_NAMES[format]]
  return Boolean(info?.output?.buffer)
}

async function detectFormat(input: Buffer): Promise<SharpFormat> {
  const meta = await sharp(input).metadata()
  return (meta.format as SharpFormat) ?? 'jpeg'
}

export async function compressBuffer(
  input: Buffer,
  opts: CompressOptions
): Promise<{ buffer: Buffer; ext: string }> {
  const format = opts.format ?? (await detectFormat(input))
  if (!isFormatSupported(format)) {
    throw new Error(`Output format "${format}" is not supported by this Sharp/libvips build`)
  }
  const quality = opts.quality ?? 80
  const sharpOpts: Record<string, unknown> = { quality }
  if (format === 'heif') sharpOpts.compression = 'hevc'
  const buffer = await sharp(input).toFormat(format as any, sharpOpts).toBuffer()
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
  if (!isFormatSupported(format)) {
    throw new Error(`Output format "${format}" is not supported by this Sharp/libvips build`)
  }
  const quality = opts.quality ?? 80
  const sharpOpts: Record<string, unknown> = { quality }
  if (format === 'heif') sharpOpts.compression = 'hevc'
  pipeline = pipeline.toFormat(format as any, sharpOpts)

  const buffer = await pipeline.toBuffer()
  return { buffer, ext: format }
}

export async function fetchRemoteImage(url: string): Promise<Buffer> {
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

  return Buffer.from(await res.arrayBuffer())
}

export async function fetchAndTransform(
  url: string,
  opts: EditOptions
): Promise<{ buffer: Buffer; contentType: string }> {
  const inputBuffer = await fetchRemoteImage(url)
  const { buffer, ext } = await transformBuffer(inputBuffer, opts)
  return { buffer, contentType: `image/${ext}` }
}

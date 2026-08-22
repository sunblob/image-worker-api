import { describe, it, expect } from 'bun:test'
import sharp from 'sharp'
import { compressBuffer, transformBuffer } from '../src/services/imageService'

// Minimal 20x20 JPEG test image
const testJpeg = await sharp({
  create: { width: 20, height: 20, channels: 3, background: { r: 200, g: 100, b: 50 } },
}).jpeg().toBuffer()

describe('compressBuffer', () => {
  it('converts to webp', async () => {
    const { buffer, ext } = await compressBuffer(testJpeg, { format: 'webp', quality: 80 })
    expect(ext).toBe('webp')
    const meta = await sharp(buffer).metadata()
    expect(meta.format).toBe('webp')
  })

  it('keeps original format when none specified', async () => {
    const { ext } = await compressBuffer(testJpeg, { quality: 80 })
    expect(ext).toBe('jpeg')
  })

  it('returns SVG untouched', async () => {
    const svg = Buffer.from('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>')
    const { buffer, ext, passthrough } = await compressBuffer(svg, { format: 'webp', quality: 80 })
    expect(passthrough).toBe(true)
    expect(ext).toBe('svg')
    expect(buffer.equals(svg)).toBe(true)
  })

  it('returns ICO untouched', async () => {
    // ICONDIR (1 entry) + one 16x16 ICONDIRENTRY, contents irrelevant — sharp never sees it
    const ico = Buffer.concat([
      Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01, 0x00]),
      Buffer.alloc(16, 0x10),
    ])
    const { buffer, ext, passthrough } = await compressBuffer(ico, { quality: 80 })
    expect(passthrough).toBe(true)
    expect(ext).toBe('ico')
    expect(buffer.equals(ico)).toBe(true)
  })

  it('keeps the original when re-encoding makes the file bigger', async () => {
    // Random noise is near-incompressible: a lossy JPEG of it blows up as lossless PNG.
    const noise = Buffer.alloc(64 * 64 * 3)
    for (let i = 0; i < noise.length; i++) noise[i] = (i * 2654435761) % 251
    const noiseJpeg = await sharp(noise, { raw: { width: 64, height: 64, channels: 3 } })
      .jpeg({ quality: 40 })
      .toBuffer()

    const { buffer, ext, passthrough } = await compressBuffer(noiseJpeg, { format: 'png' })
    expect(passthrough).toBe(true)
    expect(ext).toBe('jpeg')
    expect(buffer.equals(noiseJpeg)).toBe(true)
  })

  it('returns the compressed result when it is smaller', async () => {
    const big = await sharp({
      create: { width: 400, height: 400, channels: 3, background: { r: 12, g: 200, b: 90 } },
    }).png().toBuffer()
    const { buffer, passthrough } = await compressBuffer(big, { format: 'webp', quality: 60 })
    expect(passthrough).toBeUndefined()
    expect(buffer.length).toBeLessThan(big.length)
  })
})

describe('transformBuffer', () => {
  it('resizes to specified width and height', async () => {
    const { buffer } = await transformBuffer(testJpeg, { width: 5, height: 5 })
    const meta = await sharp(buffer).metadata()
    expect(meta.width).toBe(5)
    expect(meta.height).toBe(5)
  })

  it('converts format', async () => {
    const { buffer, ext } = await transformBuffer(testJpeg, { format: 'png' })
    expect(ext).toBe('png')
    const meta = await sharp(buffer).metadata()
    expect(meta.format).toBe('png')
  })

  it('applies grayscale (R=G=B for all pixels)', async () => {
    const { buffer } = await transformBuffer(testJpeg, { grayscale: true })
    const { data } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true })
    // Sharp grayscale keeps 3 channels but sets R=G=B
    const isGray = data[0] === data[1] && data[1] === data[2]
    expect(isGray).toBe(true)
  })

  it('rotates 90 degrees (swaps width/height)', async () => {
    const tallJpeg = await sharp({
      create: { width: 4, height: 10, channels: 3, background: { r: 0, g: 0, b: 255 } },
    }).jpeg().toBuffer()
    const { buffer } = await transformBuffer(tallJpeg, { rotate: 90 })
    const meta = await sharp(buffer).metadata()
    expect(meta.width).toBe(10)
    expect(meta.height).toBe(4)
  })
})

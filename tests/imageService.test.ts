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

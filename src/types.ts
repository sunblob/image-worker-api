export type JobStatus = 'processing' | 'done' | 'error'

export interface JobRecord {
  status: JobStatus
  originalName: string
  sizeBefore: number
  sizeAfter?: number
  originalPath?: string
  outputPath?: string
  ext?: string
  /** Output is the original file, untouched (unencodable format, or compression made it bigger). */
  passthrough?: boolean
  error?: string
  createdAt: number
}

export interface CompressOptions {
  format?: 'webp' | 'avif' | 'jpeg' | 'png' | 'tiff' | 'heif'
  quality?: number
}

export interface EditOptions {
  format?: 'webp' | 'avif' | 'jpeg' | 'png' | 'tiff' | 'heif'
  quality?: number
  width?: number
  height?: number
  fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside'
  blur?: number
  sharpen?: boolean
  grayscale?: boolean
  rotate?: 0 | 90 | 180 | 270
  flip?: 'horizontal' | 'vertical'
}

// Shape returned by GET /jobs/:id — outputPath intentionally excluded
export interface JobResponse {
  id: string
  status: JobStatus
  originalName: string
  sizeBefore: number
  sizeAfter?: number
  ext?: string
  passthrough?: boolean
  error?: string
  createdAt: number
}

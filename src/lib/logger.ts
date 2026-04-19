const fmt = (level: string, msg: string, ctx?: Record<string, unknown>) => {
  const base = `[${new Date().toISOString()}] [${level}] ${msg}`
  return ctx && Object.keys(ctx).length ? `${base} ${JSON.stringify(ctx)}` : base
}

export const logger = {
  info: (msg: string, ctx?: Record<string, unknown>) => console.log(fmt('INFO', msg, ctx)),
  warn: (msg: string, ctx?: Record<string, unknown>) => console.warn(fmt('WARN', msg, ctx)),
  error: (msg: string, err?: unknown, ctx?: Record<string, unknown>) => {
    const errMsg = err instanceof Error ? err.message : err !== undefined ? String(err) : undefined
    const stack = err instanceof Error ? err.stack : undefined
    const merged = { ...ctx, ...(errMsg ? { error: errMsg } : {}), ...(stack ? { stack } : {}) }
    console.error(fmt('ERROR', msg, merged))
  },
}

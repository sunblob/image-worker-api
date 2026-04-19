FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies (separate layer for caching)
FROM base AS deps
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# Production image
FROM base AS runner
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Install Chromium + its system-level OS dependencies into this final image.
# Must run here (not in the deps stage) because the browser binary is stored
# in /root/.cache/ms-playwright — outside node_modules — so it is NOT carried
# over by the COPY --from=deps above.
RUN node_modules/.bin/playwright install chromium --with-deps

# Ensure tmp dir exists
RUN mkdir -p /tmp/imgworker

EXPOSE 3001

CMD ["bun", "run", "src/index.ts"]

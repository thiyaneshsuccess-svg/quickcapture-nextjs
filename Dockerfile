# QuickCapture — production image
# Build:  docker build -t quickcapture .
# Run:    docker run -p 3000:3000 -v quickcapture-data:/app/data quickcapture
#
# Multi-stage: deps → build → slim runtime. The task store writes to
# /app/data; mount a volume there to persist tasks across container
# restarts (or configure a managed Postgres via lib/tasks/store.ts).

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    QUICKCAPTURE_DATA_DIR=/app/data

# Run as a non-root user; give it ownership of the data directory.
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs \
    && mkdir -p /app/data && chown -R nextjs:nodejs /app/data

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>{if(!r.ok)throw 0}).catch(()=>process.exit(1))"

CMD ["npx", "next", "start"]

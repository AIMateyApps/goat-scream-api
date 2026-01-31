# syntax=docker/dockerfile:1

ARG NODE_VERSION=20-alpine

FROM node:${NODE_VERSION} AS builder
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json pnpm-lock.yaml ./
COPY scripts/run-husky.js ./scripts/run-husky.js
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
RUN CI=true pnpm prune --prod

FROM node:${NODE_VERSION} AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ARG BUILD_TIME
ARG COMMIT_SHA
ENV BUILD_TIME=${BUILD_TIME}
ENV COMMIT_SHA=${COMMIT_SHA}
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/public ./public
COPY --from=builder /app/docs ./docs
COPY --from=builder /app/mock-data ./mock-data
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/data ./data
COPY --from=builder /app/server.js ./server.js
EXPOSE 3000

# Health check for container orchestration (Kubernetes, Docker Compose, etc.)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]

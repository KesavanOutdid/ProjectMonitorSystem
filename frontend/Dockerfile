# -------------------------------------------------------------
# Project Monitor System - Frontend Multi-Stage Dockerfile
# -------------------------------------------------------------

# Stage 1: Install Dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package*.json ./
RUN npm ci

# Stage 2: Build Next.js standalone application
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p public

# Pass build-time environment arguments (can be overridden in docker-compose)
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SOCKET_URL
ARG NEXT_PUBLIC_BACKEND_IP
ARG NEXT_PUBLIC_BACKEND_PORT
ARG NEXT_PUBLIC_BACKEND_PROTOCOL
ARG NEXT_PUBLIC_SOCKET_IP
ARG NEXT_PUBLIC_SOCKET_PORT
ARG NEXT_PUBLIC_SOCKET_PROTOCOL
ARG NEXT_PUBLIC_REDIS_HOST
ARG NEXT_PUBLIC_REDIS_PORT

ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_PUBLIC_SOCKET_URL=${NEXT_PUBLIC_SOCKET_URL}
ENV NEXT_PUBLIC_BACKEND_IP=${NEXT_PUBLIC_BACKEND_IP}
ENV NEXT_PUBLIC_BACKEND_PORT=${NEXT_PUBLIC_BACKEND_PORT}
ENV NEXT_PUBLIC_BACKEND_PROTOCOL=${NEXT_PUBLIC_BACKEND_PROTOCOL}
ENV NEXT_PUBLIC_SOCKET_IP=${NEXT_PUBLIC_SOCKET_IP}
ENV NEXT_PUBLIC_SOCKET_PORT=${NEXT_PUBLIC_SOCKET_PORT}
ENV NEXT_PUBLIC_SOCKET_PROTOCOL=${NEXT_PUBLIC_SOCKET_PROTOCOL}
ENV NEXT_PUBLIC_REDIS_HOST=${NEXT_PUBLIC_REDIS_HOST}
ENV NEXT_PUBLIC_REDIS_PORT=${NEXT_PUBLIC_REDIS_PORT}
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run build

# Stage 3: Lightweight Production Runner (~120MB)
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy static assets and standalone server bundle
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000 || exit 1

CMD ["node", "server.js"]

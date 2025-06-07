# Multi-stage Docker build for RRA V2 Application
# Stage 1: Dependencies and build
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    libc6-compat \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    musl-dev \
    giflib-dev \
    pixman-dev \
    pangomm-dev \
    libjpeg-turbo-dev \
    freetype-dev

# Install bun package manager
RUN npm install -g bun

# Copy package files
COPY package.json bun.lock* ./

# Install dependencies
RUN bun install --frozen-lockfile --production=false

# Copy source code
COPY . .

# Copy environment variables template
COPY .env.example .env.local

# Build the application
RUN bun run build

# Stage 2: Production runtime
FROM node:20-alpine AS runner

# Set working directory
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Install system dependencies for runtime
RUN apk add --no-cache \
    curl \
    dumb-init \
    tini

# Install bun for production
RUN npm install -g bun

# Copy built application from builder stage
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy database migrations and utilities
COPY --from=builder /app/lib/db/migrations ./lib/db/migrations
COPY --from=builder /app/lib/db/migrate.ts ./lib/db/migrate.ts
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts

# Set ownership
RUN chown -R nextjs:nodejs /app

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

# Use tini as PID 1 for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Start the application with database migration
CMD ["sh", "-c", "bun run lib/db/migrate.ts && node server.js"]

# Development stage
FROM builder AS development

# Install development dependencies
RUN bun install --frozen-lockfile

# Expose port and enable hot reload
EXPOSE 3000
EXPOSE 24678

# Set environment
ENV NODE_ENV=development

# Development command
CMD ["bun", "run", "dev"]
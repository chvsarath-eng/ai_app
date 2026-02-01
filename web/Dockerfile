# ============================================
# Next.js Standalone Dockerfile for Cloud Run
# ============================================

FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Build the application
FROM base AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set environment for build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Paddle environment variables (set at build time for NEXT_PUBLIC_)
ARG NEXT_PUBLIC_PADDLE_ENVIRONMENT=sandbox
ARG NEXT_PUBLIC_PADDLE_CLIENT_TOKEN
ARG NEXT_PUBLIC_PADDLE_PRICE_DIGITAL=pri_01kgbfsfghbddqsaz0t77m50qy
ARG NEXT_PUBLIC_PADDLE_PRICE_HARDCOVER=pri_01kgbfsgjxhsgab6kp453mqh0n

ENV NEXT_PUBLIC_PADDLE_ENVIRONMENT=${NEXT_PUBLIC_PADDLE_ENVIRONMENT}
ENV NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=${NEXT_PUBLIC_PADDLE_CLIENT_TOKEN}
ENV NEXT_PUBLIC_PADDLE_PRICE_DIGITAL=${NEXT_PUBLIC_PADDLE_PRICE_DIGITAL}
ENV NEXT_PUBLIC_PADDLE_PRICE_HARDCOVER=${NEXT_PUBLIC_PADDLE_PRICE_HARDCOVER}

# Build Next.js
RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy public assets
COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Copy standalone build output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Switch to non-root user
USER nextjs

# Expose port (Cloud Run uses PORT env variable)
EXPOSE 3000

# Set default port
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Start the server
CMD ["node", "server.js"]

# Stage 1: Build
FROM docker-central.adda247.com/base-images/node-20-alpine:0.0.1 AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN npm run build

# Stage 2: Production runner
FROM docker-central.adda247.com/base-images/node-20-alpine:0.0.1 AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
RUN chown -R nextjs:nodejs /app
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1
CMD ["npm", "start"]

# # Stage 1: Build image
# FROM node:20-alpine AS builder
# WORKDIR /app

# # Install dependencies first (leverage layer caching)
# COPY package*.json ./
# RUN npm ci

# # Copy the rest of the application code
# COPY . .

# # Set environment variables for build
# ENV NEXT_TELEMETRY_DISABLED=1
# ENV NODE_ENV=production

# # Run production build
# RUN npm run build

# # Stage 2: Production runner
# FROM node:20-alpine AS runner
# WORKDIR /app

# # Set environment variables
# ENV NODE_ENV=production
# ENV PORT=3000
# ENV NEXT_TELEMETRY_DISABLED=1

# # Create a system user and group for running the container securely (least privilege)
# RUN addgroup --system --gid 1001 nodejs
# RUN adduser --system --uid 1001 nextjs

# # Copy public assets and built app files
# COPY --from=builder /app/public ./public
# COPY --from=builder /app/.next ./.next
# COPY --from=builder /app/node_modules ./node_modules
# COPY --from=builder /app/package.json ./package.json

# # Adjust permissions
# RUN chown -R nextjs:nodejs /app

# # Switch to the non-root user
# USER nextjs

# # Expose Next.js unified port
# EXPOSE 3000

# # Docker healthcheck
# HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
#   CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# # Start production server
# CMD ["npm", "start"]

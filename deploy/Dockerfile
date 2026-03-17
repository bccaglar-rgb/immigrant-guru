# ──────────────────────────────────────────────────────────────
# Bitrium API — Multi-stage Dockerfile
# ──────────────────────────────────────────────────────────────
# Stage 1: Build the Vite frontend
# Stage 2: Prepare the Node.js API server
# Stage 3: Final production image (Node 22 slim)
# ──────────────────────────────────────────────────────────────

# ── Stage 1: Frontend build ────────────────────────────────────
FROM node:22-alpine AS frontend-build
WORKDIR /app

# Install frontend deps
COPY package*.json ./
RUN npm ci --ignore-scripts

# Copy frontend source
COPY src/ ./src/
COPY index.html tsconfig*.json vite.config* ./
COPY public/ ./public/ 2>/dev/null || true

# Build Vite output → /app/dist
RUN npm run build

# ── Stage 2: Server deps ───────────────────────────────────────
FROM node:22-alpine AS server-deps
WORKDIR /app/server

COPY server/package*.json ./
RUN npm ci --ignore-scripts --omit=dev

# ── Stage 3: Production image ──────────────────────────────────
FROM node:22-alpine AS production

# PM2 for process management
RUN npm install -g pm2 && npm cache clean --force

WORKDIR /app

# Copy frontend build → /app/dist (served by nginx externally or express in dev)
COPY --from=frontend-build /app/dist ./dist

# Copy server source
COPY server/ ./server/

# Copy server prod dependencies
COPY --from=server-deps /app/server/node_modules ./server/node_modules

# Copy PM2 ecosystem config
COPY deploy/pm2.ecosystem.config.js ./ecosystem.config.js

# Create data directory for optimizer config
RUN mkdir -p /app/server/data

# Non-root user
RUN addgroup -g 1001 -S bitrium && adduser -u 1001 -S bitrium -G bitrium
RUN chown -R bitrium:bitrium /app
USER bitrium

EXPOSE 8090

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:8090/api/health || exit 1

# Start with PM2 (cluster mode defined in ecosystem.config.js)
CMD ["pm2-runtime", "ecosystem.config.js"]

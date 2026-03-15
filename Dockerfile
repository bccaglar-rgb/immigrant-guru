# ---- Stage 1: Build frontend ----
FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY . .
RUN npx vite build

# ---- Stage 2: Production runtime ----
FROM node:22-alpine AS runtime

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# Copy server source (TypeScript — uses --experimental-strip-types)
COPY server/ ./server/
# Copy shared source files imported by server (src/data/*)
COPY src/ ./src/
# Copy built frontend assets
COPY --from=build /app/dist ./dist

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8090

EXPOSE 8090

CMD ["node", "--experimental-strip-types", "server/src/index.ts"]

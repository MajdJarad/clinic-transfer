# Multi-stage Dockerfile for Clinic Transfer System
FROM node:20-slim AS builder

RUN apt-get update -y && apt-get install -y openssl

WORKDIR /app

# Build Web
COPY web/package*.json ./web/
RUN cd web && npm ci

COPY web ./web
RUN cd web && npm run build

# Build Server
COPY server/package*.json ./server/
RUN cd server && npm ci

COPY server ./server
RUN cd server && npx prisma generate && npm run build

# Production Runner
FROM node:20-slim AS runner

RUN apt-get update -y && apt-get install -y openssl

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_URL="file:./dev.db"
ENV JWT_SECRET="clinic-transfer-jwt-secret-production"

COPY --from=builder /app/server/package*.json ./server/
COPY --from=builder /app/server/node_modules ./server/node_modules
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/prisma ./server/prisma
COPY --from=builder /app/web/dist ./web/dist

WORKDIR /app/server
EXPOSE 3000

CMD ["node", "dist/index.js"]

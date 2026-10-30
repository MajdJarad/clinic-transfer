# Multi-stage Dockerfile for Clinic Transfer System
FROM node:20-alpine AS builder

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
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/server/package*.json ./server/
RUN cd server && npm ci --only=production

COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/prisma ./server/prisma
COPY --from=builder /app/web/dist ./web/dist

# Ensure database directory and initial seed if needed
WORKDIR /app/server
RUN npx prisma generate

EXPOSE 3000

CMD ["node", "dist/index.js"]

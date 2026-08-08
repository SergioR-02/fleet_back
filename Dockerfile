# ── Build ────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

RUN apk add --no-cache openssl

COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build
# nest build con sourceRoot=src → dist/main.js
RUN test -f dist/main.js || (echo "ERROR: dist/main.js no generado" && ls -laR dist && exit 1)
RUN npm prune --omit=dev

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV RUN_SEED=true

RUN apk add --no-cache openssl

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY docker/entrypoint.sh ./docker/entrypoint.sh

RUN chmod +x ./docker/entrypoint.sh \
  && npx prisma generate

EXPOSE 3000

ENTRYPOINT ["./docker/entrypoint.sh"]

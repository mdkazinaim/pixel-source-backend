# ──────────────────────────────────────────
# Stage 1: Builder
# ──────────────────────────────────────────
FROM node:20-bullseye AS builder

RUN apt-get update && apt-get install -y \
  python3 make g++ gcc postgresql-client \
  && ln -sf python3 /usr/bin/python \
  && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /usr/src/app && chown -R node:node /usr/src/app
WORKDIR /usr/src/app
USER node

COPY --chown=node:node package*.json ./
COPY --chown=node:node prisma ./prisma

RUN npm ci --fetch-retries=5 --fetch-retry-mintimeout=20000 --fetch-retry-maxtimeout=120000

COPY --chown=node:node . .

RUN npx prisma generate
RUN npm run build

# ──────────────────────────────────────────
# Stage 2: Runtime (lean production image)
# ──────────────────────────────────────────
FROM node:20-bullseye AS runtime

RUN apt-get update && apt-get install -y \
  postgresql-client \
  libnss3 \
  libatk-bridge2.0-0 \
  libxcomposite1 \
  libxdamage1 \
  libxrandr2 \
  libgbm1 \
  libasound2 \
  libpangocairo-1.0-0 \
  libgtk-3-0 \
  libcups2 \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

RUN mkdir -p uploads/profile-images uploads-file/png \
  && chown -R node:node uploads uploads-file

USER node

COPY --from=builder --chown=node:node /usr/src/app/dist        ./dist
COPY --from=builder --chown=node:node /usr/src/app/node_modules ./node_modules
COPY --from=builder --chown=node:node /usr/src/app/prisma      ./prisma
COPY --from=builder --chown=node:node /usr/src/app/package*.json ./

ENV NODE_ENV=production

EXPOSE 3000

CMD ["bash", "-c", "\
  echo '⏳ Waiting for Database...'; \
  until pg_isready -d \"$DATABASE_URL\"; do sleep 2; done; \
  echo '⚙️  Generating Prisma Client...'; \
  npx prisma generate; \
  echo '📦 Running Prisma Migrations...'; \
  npx prisma migrate deploy; \
  echo '🚀 Starting API...'; \
  exec node dist/main.js \
"]

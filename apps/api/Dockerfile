# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

RUN corepack enable

WORKDIR /app

# Copy workspace manifests first (better layer caching)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./

# Copy all packages (pnpm deploy resolves workspace refs for all, even devDeps)
COPY packages/ ./packages/

# Copy API source
COPY apps/api ./apps/api

# Install all workspace deps (pnpm hoists shared to root node_modules)
RUN pnpm install --frozen-lockfile

# Build document-intelligence first (tsconfig path dep, not package.json dep)
RUN pnpm --filter @tc/document-intelligence build

# Compile the API
RUN pnpm --filter @tc/api build

# Create a self-contained production bundle (resolves workspace symlinks)
RUN pnpm --filter @tc/api --prod deploy --legacy /deploy

# Replace hardlinked @tc/document-intelligence with real copies so
# dist/ is available at runtime (pnpm deploy creates hardlinks that
# omit dist/ since it's built, not in package.json files)
RUN rm -rf /deploy/node_modules/@tc/document-intelligence && \
    mkdir -p /deploy/node_modules/@tc/document-intelligence && \
    cp -r /app/packages/document-intelligence/package.json /deploy/node_modules/@tc/document-intelligence/ && \
    cp -r /app/packages/document-intelligence/dist /deploy/node_modules/@tc/document-intelligence/dist

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

RUN apk add --no-cache qpdf

WORKDIR /app

ENV NODE_ENV=production

# Production node_modules from pnpm deploy (includes @tc/shared as real package)
COPY --from=builder /deploy/node_modules ./node_modules
COPY --from=builder /deploy/package.json ./

# Compiled output (not copied by pnpm deploy — dist is not in package files)
COPY --from=builder /app/apps/api/dist ./dist

# Handlebars views for admin UI
COPY --from=builder /app/apps/api/views ./views

EXPOSE 3000

CMD ["node", "dist/main"]

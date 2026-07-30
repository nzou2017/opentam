FROM node:20-alpine AS builder
WORKDIR /app
# Copy workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/
RUN npm install -g pnpm && pnpm install --frozen-lockfile
COPY packages/shared ./packages/shared
COPY packages/backend ./packages/backend
RUN pnpm --filter @opentam/shared build && pnpm --filter @opentam/backend build

FROM node:20-alpine
WORKDIR /app
# pnpm links workspace deps with relative symlinks (e.g.
# packages/backend/node_modules/fastify -> ../../../node_modules/.pnpm/...),
# so the final stage must preserve the same directory depth as the builder
# rather than flattening dist/node_modules into /app — flattening breaks
# every relative symlink target.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/packages/backend ./packages/backend
ENV NODE_ENV=production PORT=3001
EXPOSE 3001
CMD ["node", "packages/backend/dist/index.js"]

FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/dashboard/package.json ./packages/dashboard/
RUN npm install -g pnpm && pnpm install --frozen-lockfile
COPY packages/shared ./packages/shared
COPY packages/dashboard ./packages/dashboard
ARG NEXT_PUBLIC_BACKEND_URL
ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL
RUN pnpm --filter @opentam/shared build && pnpm --filter @opentam/dashboard build
RUN mkdir -p packages/dashboard/public

FROM node:20-alpine
WORKDIR /app
# pnpm links workspace deps with relative symlinks, so the final stage must
# preserve the same directory depth as the builder rather than flattening
# .next/node_modules into /app — flattening breaks every relative symlink.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/packages/dashboard ./packages/dashboard
WORKDIR /app/packages/dashboard
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["node_modules/.bin/next", "start", "-p", "3000"]

FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/dashboard/package.json ./packages/dashboard/
RUN npm install -g pnpm && pnpm install --frozen-lockfile
COPY packages/shared ./packages/shared
COPY packages/dashboard ./packages/dashboard
RUN pnpm --filter @opentam/shared build && pnpm --filter @opentam/dashboard build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/packages/dashboard/.next ./.next
COPY --from=builder /app/packages/dashboard/public ./public
COPY --from=builder /app/packages/dashboard/node_modules ./node_modules
COPY packages/dashboard/package.json .
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["node_modules/.bin/next", "start", "-p", "3000"]

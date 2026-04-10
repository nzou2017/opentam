FROM node:20-alpine AS builder
WORKDIR /app
# Copy workspace files
COPY package.json pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/backend/package.json ./packages/backend/
RUN npm install -g pnpm && pnpm install --frozen-lockfile
COPY packages/shared ./packages/shared
COPY packages/backend ./packages/backend
RUN pnpm --filter @opentam/shared build && pnpm --filter @opentam/backend build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/packages/backend/dist ./dist
COPY --from=builder /app/packages/shared/dist ./node_modules/@opentam/shared/dist
COPY --from=builder /app/packages/shared/package.json ./node_modules/@opentam/shared/package.json
COPY --from=builder /app/packages/backend/node_modules ./node_modules
COPY packages/backend/package.json .
ENV NODE_ENV=production PORT=3001
EXPOSE 3001
CMD ["node", "dist/index.js"]

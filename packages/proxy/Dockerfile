FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
COPY packages/proxy/package.json ./packages/proxy/
RUN npm install -g pnpm && pnpm install --frozen-lockfile
COPY packages/proxy ./packages/proxy
RUN pnpm --filter @opentam/proxy build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/packages/proxy/dist ./dist
COPY --from=builder /app/packages/proxy/node_modules ./node_modules
COPY packages/proxy/package.json .
# Copy SDK build output so /sdk/q.min.js can be served
COPY packages/sdk/dist ./sdk_dist
ENV NODE_ENV=production PROXY_PORT=3002
EXPOSE 3002
CMD ["node", "dist/index.js"]

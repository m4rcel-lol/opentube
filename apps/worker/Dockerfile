FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache ffmpeg openssl wget

FROM base AS deps
COPY package.json ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm install --workspaces --include-workspace-root=false

FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/backend/prisma apps/backend/prisma
COPY apps/worker apps/worker
RUN npm --workspace packages/shared run build
RUN npm --workspace apps/worker run prisma:generate
RUN npm --workspace apps/worker run build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/apps/worker/package.json ./apps/worker/package.json
COPY --from=build /app/apps/worker/dist ./apps/worker/dist
EXPOSE 3002
CMD ["node", "apps/worker/dist/worker.js"]

# GreekBot production image
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
COPY assets ./assets
RUN npx prisma generate && npm run build && npm prune --omit=dev

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S greekbot && adduser -S greekbot -G greekbot
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/assets ./assets
RUN mkdir -p /app/data && chown -R greekbot:greekbot /app
USER greekbot
CMD ["sh", "-c", "npx prisma db push && node dist/index.js"]

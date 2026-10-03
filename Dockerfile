FROM oven/bun:1.3.14 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1.3.14-slim
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/data ./data
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4173
RUN mkdir .cache && chown bun:bun .cache
USER bun
EXPOSE 4173
CMD ["bun", "server/index.ts"]

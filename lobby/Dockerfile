FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
COPY lobby/package.json lobby/bun.lock ./lobby/
RUN cd lobby && bun install --frozen-lockfile

# Copy source
COPY lobby/server.ts ./lobby/

EXPOSE 8080

ENV PORT=8080

CMD ["bun", "run", "lobby/server.ts"]

FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
COPY lobby/package.json ./lobby/
RUN cd lobby && bun install --frozen-lockfile || bun install

# Copy source
COPY lobby/server.ts ./lobby/

EXPOSE 8080

ENV PORT=8080
ENV GITHUB_CLIENT_ID=""
ENV GITHUB_CLIENT_SECRET=""
ENV BASE_URL=""

CMD ["bun", "run", "lobby/server.ts"]

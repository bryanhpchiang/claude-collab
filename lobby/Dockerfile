FROM public.ecr.aws/docker/library/debian:bookworm-slim AS base
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl unzip \
  && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://bun.sh/install | bash

ENV BUN_INSTALL="/root/.bun"
ENV PATH="${BUN_INSTALL}/bin:${PATH}"

# Install client dependencies and build
COPY client/package.json client/bun.lock ./client/
RUN cd client && bun install --frozen-lockfile

COPY client/ ./client/
RUN cd client && bun run build

# Install lobby dependencies
COPY lobby/package.json lobby/bun.lock ./lobby/
RUN cd lobby && bun install --frozen-lockfile

# Copy lobby source
COPY lobby/server.ts ./lobby/

EXPOSE 8080

ENV PORT=8080

CMD ["bun", "run", "lobby/server.ts"]

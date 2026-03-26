FROM public.ecr.aws/docker/library/debian:bookworm-slim

WORKDIR /home/user/jam

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git gnupg unzip \
  && mkdir -p /etc/apt/keyrings \
  && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
  && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" > /etc/apt/sources.list.d/nodesource.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends nodejs \
  && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://bun.sh/install | bash \
  && ln -sf /root/.bun/bin/bun /usr/local/bin/bun

ENV PATH="/usr/local/bin:/root/.bun/bin:${PATH}"

RUN npm install -g @anthropic-ai/claude-code

COPY package.json bun.lock ./
COPY packages/coordination/package.json ./packages/coordination/package.json
COPY packages/jam-proxy/package.json ./packages/jam-proxy/package.json
COPY packages/runtime/package.json ./packages/runtime/package.json
COPY packages/shared/package.json ./packages/shared/package.json

RUN bun install --frozen-lockfile --filter @jam/runtime

COPY packages/runtime ./packages/runtime
COPY packages/shared ./packages/shared

RUN bun run runtime:web:build \
  && git config --global user.name "Jam" \
  && git config --global user.email "jam@letsjam.now"

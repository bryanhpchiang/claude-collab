FROM public.ecr.aws/docker/library/debian:bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl unzip \
  && curl -fsSL https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem -o /etc/ssl/certs/rds-global-bundle.pem \
  && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://bun.sh/install | bash

ENV BUN_INSTALL="/root/.bun"
ENV PATH="${BUN_INSTALL}/bin:${PATH}"

COPY package.json bun.lock ./
COPY packages/coordination/package.json ./packages/coordination/package.json
COPY packages/runtime/package.json ./packages/runtime/package.json
COPY packages/shared/package.json ./packages/shared/package.json
RUN bun install --frozen-lockfile --filter @jam/coordination

COPY packages/shared ./packages/shared
COPY packages/coordination ./packages/coordination

WORKDIR /app/packages/coordination

EXPOSE 8080

ENV PORT=8080

CMD ["bun", "run", "start"]

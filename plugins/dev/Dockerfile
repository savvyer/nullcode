# nullcode dev container: all installs/builds/tests run here, never on the host.
FROM node:24-bookworm
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    PNPM_CONFIG_STORE_DIR=/pnpm-store \
    DSH_TELEMETRY_DISABLED=1 \
    CI=1
RUN corepack enable
WORKDIR /src/nullcode

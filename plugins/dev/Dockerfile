# nullcode dev container: every install, build and test runs here, never on the host.
# plugins/dev/run.sh bind-mounts the git checkout at /work and the pnpm store volume at /pnpm-store.
FROM node:24-bookworm
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    PNPM_CONFIG_STORE_DIR=/pnpm-store \
    PNPM_CONFIG_PACKAGE_IMPORT_METHOD=copy \
    DSH_TELEMETRY_DISABLED=1 \
    CI=1
RUN corepack enable && git config --system --add safe.directory /work
WORKDIR /work

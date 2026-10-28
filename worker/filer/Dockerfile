# Build from the repo root: docker build -f worker/filer/Dockerfile .
FROM mcr.microsoft.com/playwright:v1.56.0-noble
WORKDIR /app
# Every file outside worker/filer the worker's code imports (test/docker.test.ts checks this list against the imports)
COPY src/renewal.ts src/renewal.ts
COPY supabase/functions/_shared/agent_inbox.ts supabase/functions/_shared/agent_inbox.ts
COPY supabase/functions/_shared/carry.ts supabase/functions/_shared/carry.ts
COPY supabase/functions/_shared/injection.ts supabase/functions/_shared/injection.ts
COPY supabase/functions/_shared/zdr.ts supabase/functions/_shared/zdr.ts
COPY supabase/functions/file/accounts.ts supabase/functions/file/accounts.ts
COPY supabase/functions/file/destinations.ts supabase/functions/file/destinations.ts
COPY supabase/functions/file/dest/midatlantic.ts supabase/functions/file/dest/midatlantic.ts
COPY supabase/functions/file/dest/plains.ts supabase/functions/file/dest/plains.ts
COPY supabase/functions/file/dest/west.ts supabase/functions/file/dest/west.ts
COPY supabase/functions/file/dest/midwest.ts supabase/functions/file/dest/midwest.ts
# package-lock pins playwright-core to the same version as this image's browsers (1.56.0); keep them in step
COPY worker/filer/package.json worker/filer/package-lock.json worker/filer/
RUN cd worker/filer && npm ci --omit=dev
COPY worker/filer/src worker/filer/src
WORKDIR /app/worker/filer
# Run as the image's unprivileged user, not root: the code and node_modules stay root-owned and read-only to it, and
# each run's files go in its own folder under /tmp (worker/filer/src/run.ts). worker/filer/test/docker.test.ts checks.
USER pwuser
CMD ["npm", "start"]

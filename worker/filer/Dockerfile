# Build from the repo root: docker build -f worker/filer/Dockerfile .
FROM mcr.microsoft.com/playwright:v1.56.0-noble
WORKDIR /app
COPY supabase/functions/file/destinations.ts supabase/functions/file/destinations.ts
COPY supabase/functions/_shared/zdr.ts supabase/functions/_shared/zdr.ts
# package-lock pins playwright-core to the same version as this image's browsers (1.56.0); keep them in step
COPY worker/filer/package.json worker/filer/package-lock.json worker/filer/
RUN cd worker/filer && npm ci --omit=dev
COPY worker/filer/src worker/filer/src
WORKDIR /app/worker/filer
CMD ["npm", "start"]

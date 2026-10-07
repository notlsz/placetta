# Build from the repo root: docker build -f worker/filer/Dockerfile .
FROM mcr.microsoft.com/playwright:v1.56.0-noble
WORKDIR /app
COPY supabase/functions/file/destinations.ts supabase/functions/file/destinations.ts
COPY worker/filer/package.json worker/filer/package.json
RUN cd worker/filer && npm install --omit=dev
COPY worker/filer/src worker/filer/src
WORKDIR /app/worker/filer
CMD ["npm", "start"]

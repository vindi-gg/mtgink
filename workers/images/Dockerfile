FROM --platform=linux/amd64 node:22-slim AS build

WORKDIR /app

COPY container_src/package.json container_src/package-lock.json* ./
RUN npm install

COPY container_src/tsconfig.json ./
COPY container_src/src/ src/
RUN npx tsc

FROM --platform=linux/amd64 node:22-slim

WORKDIR /app

COPY container_src/package.json container_src/package-lock.json* ./
RUN npm install --omit=dev

COPY --from=build /app/dist/ dist/

CMD ["node", "dist/index.js"]

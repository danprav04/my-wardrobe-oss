FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN npm prune --production

FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production
# Restrict Node heap memory to 192MB so it runs safely on 1GB RAM shared server
ENV NODE_OPTIONS="--max-old-space-size=192"

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/build ./build

# Create directory for persistent local image cache / data
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node

EXPOSE 3000
CMD ["node", "build"]

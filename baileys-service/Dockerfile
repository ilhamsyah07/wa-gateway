FROM node:20-alpine

WORKDIR /app

# Install build deps (Baileys needs native modules for crypto/protobuf)
RUN apk add --no-cache python3 make g++ git

COPY package.json ./
COPY yarn.lock* ./
COPY package-lock.json* ./

# Use whatever lockfile is present, else generate one.
RUN if [ -f yarn.lock ]; then \
      yarn install --production --frozen-lockfile --network-timeout 600000; \
    elif [ -f package-lock.json ]; then \
      npm ci --omit=dev; \
    else \
      npm install --omit=dev; \
    fi

COPY server.js ./

ENV NODE_ENV=production
ENV PORT=3001
ENV AUTH_DIR=/data/sessions

VOLUME ["/data"]
EXPOSE 3001

CMD ["node", "server.js"]

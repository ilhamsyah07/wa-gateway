FROM node:20-alpine

WORKDIR /app

# Install build deps (Baileys needs some native modules)
RUN apk add --no-cache python3 make g++ git

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./

ENV NODE_ENV=production
ENV PORT=3001
ENV AUTH_DIR=/data/sessions

VOLUME ["/data"]
EXPOSE 3001

CMD ["node", "server.js"]

FROM node:20-alpine AS builder

WORKDIR /app

# Copy manifest first. yarn.lock is optional (glob falls through if absent),
# but strongly recommended for reproducible builds — include it in your repo.
COPY package.json ./
COPY yarn.lock* ./

# If yarn.lock exists use --frozen-lockfile for reproducibility; otherwise
# install fresh and produce one (logged as a warning).
RUN if [ -f yarn.lock ]; then \
      yarn install --frozen-lockfile --network-timeout 600000; \
    else \
      echo "WARN: yarn.lock not found, generating a fresh one"; \
      yarn install --network-timeout 600000; \
    fi

COPY . .

ARG REACT_APP_BACKEND_URL
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL

RUN yarn build

# --- Runtime: serve static via nginx ---
FROM nginx:alpine
COPY --from=builder /app/build /usr/share/nginx/html
COPY <<'EOF' /etc/nginx/conf.d/default.conf
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;
    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF
EXPOSE 80

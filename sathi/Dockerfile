# Sathi (साथी) — production image
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY public ./public
RUN mkdir -p keys
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
# self-healing: node keeps running on contained errors; supervisor
# (docker/pm2/systemd) restarts on crash
CMD ["node", "server/index.js"]

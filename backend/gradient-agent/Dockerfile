FROM node:20-bookworm-slim

WORKDIR /app

# Copy package files and install production dependencies
COPY backend/gradient-agent/package*.json ./
RUN npm ci --omit=dev

# Copy source and shared schemas
COPY backend/gradient-agent/src ./src
COPY shared/ipc-protocol ./shared/ipc-protocol

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

CMD ["node", "src/server.js"]

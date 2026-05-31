FROM node:20-alpine AS deps
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app
RUN addgroup -S hmg && adduser -S hmg -G hmg
COPY --from=deps /app/backend/node_modules ./backend/node_modules
COPY backend/package*.json ./backend/
COPY backend/server.js ./backend/
COPY frontend/ ./backend/public/
USER hmg
EXPOSE 3000
WORKDIR /app/backend
CMD ["node", "server.js"]

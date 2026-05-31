FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S hmg && adduser -S hmg -G hmg
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY server.js ./
USER hmg
EXPOSE 3000
CMD ["node", "server.js"]

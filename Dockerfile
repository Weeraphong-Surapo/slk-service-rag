FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

# Install production dependencies first to use the Docker layer cache
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src

RUN mkdir -p /app/uploads && chown -R node:node /app
USER node

EXPOSE 3000
CMD ["node", "src/server.js"]

FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js worker.js ./
ENV NODE_ENV=production
USER node
CMD ["node", "server.js"]

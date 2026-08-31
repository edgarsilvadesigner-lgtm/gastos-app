FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY server ./server
COPY public ./public

ENV PORT=3000
ENV NODE_ENV=production

VOLUME ["/app/data"]
EXPOSE 3000

CMD ["node", "server/index.js"]

FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV NODE_ENV=production
ENV HOST=0.0.0.0
EXPOSE 8787
CMD ["node", "server/index.js"]

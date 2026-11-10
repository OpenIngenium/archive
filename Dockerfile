FROM node:22.23.4-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . /app
USER node
ENTRYPOINT ["node", "index.js"]

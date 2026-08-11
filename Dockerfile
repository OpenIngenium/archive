FROM cae-artifactory.jpl.nasa.gov:17001/node:22.23.2
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . /app
USER node
ENTRYPOINT ["node", "index.js"]

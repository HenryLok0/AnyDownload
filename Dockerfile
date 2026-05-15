FROM node:20-bookworm

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=0
RUN npx playwright install chromium || true

EXPOSE 3000
CMD ["node", "web-gui.js"]

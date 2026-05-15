FROM node:20-bookworm

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

# Chromium for render engine (auto-used only when needed)
RUN npx puppeteer browsers install chrome || true

EXPOSE 3000
CMD ["node", "web-gui.js"]

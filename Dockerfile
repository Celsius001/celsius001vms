FROM node:20-slim

WORKDIR /app

COPY package*.json ./

RUN npm install --omit=dev
RUN npx playwright install-deps firefox && npx playwright install firefox

COPY . .

EXPOSE 3000

CMD ["npm", "start"]

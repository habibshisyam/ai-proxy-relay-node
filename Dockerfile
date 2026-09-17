FROM node:22-alpine

WORKDIR /app
COPY package.json ./
COPY index.js ./

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

USER node
CMD ["npm", "start"]

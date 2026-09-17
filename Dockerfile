FROM node:22-alpine

WORKDIR /app
COPY package.json ./
COPY index.js ./

ENV NODE_ENV=production
ENV PORT=7860
EXPOSE 7860

USER node
CMD ["npm", "start"]

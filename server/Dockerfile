FROM node:22-alpine
WORKDIR /app
COPY server.mjs package.json ./
ENV NODE_ENV=production
USER node
EXPOSE 8787
CMD ["node", "server.mjs"]

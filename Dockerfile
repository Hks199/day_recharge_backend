FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
COPY package*.json ./
RUN MONGOMS_DISABLE_POSTINSTALL=1 npm ci
FROM dependencies AS build
COPY tsconfig*.json ./
COPY src ./src
RUN npm run build
FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]

FROM node:20-alpine AS builder
WORKDIR /app
ENV NODE_ENV=development
RUN corepack enable

COPY package.json tsconfig.json tsconfig.build.json ./
COPY src ./src

RUN pnpm install --ignore-scripts
RUN pnpm build
RUN pnpm prune --prod

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/main.js"]

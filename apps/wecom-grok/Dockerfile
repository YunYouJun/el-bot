FROM node:22-bookworm-slim
WORKDIR /app
COPY --chown=node:node dist/ ./dist/
USER node
CMD ["node", "dist/index.mjs"]

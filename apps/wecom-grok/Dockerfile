FROM node:26.13.0-bookworm-slim
WORKDIR /app
COPY --chown=node:node dist/ ./dist/
USER node
CMD ["node", "dist/index.mjs"]

# The service has no runtime dependencies: Node runs the TypeScript directly
# (type stripping, Node 22.18 and newer), so the image holds only app/ and the demo catalog.
FROM node:22-alpine

WORKDIR /srv
ENV NODE_ENV=production PORT=3000
COPY package.json ./
COPY app ./app
COPY demo/data ./demo/data

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "app/server.ts"]

FROM node:22-bookworm-slim

WORKDIR /app
COPY --chown=10001:10001 . .
RUN mkdir -p /app/content/blog/media /app/.blogger-state/public \
  && chown -R 10001:10001 /app/content /app/.blogger-state \
  && chmod 0750 /app/content/blog /app/content/blog/media /app/.blogger-state /app/.blogger-state/public \
  && chmod 0755 /app/deploy/docker-entrypoint.sh

ENV NODE_ENV=production \
    HOST=127.0.0.1 \
    PORT=8787

EXPOSE 8787
VOLUME ["/app/content/blog", "/app/.blogger-state", "/app/.blogger-state/public"]

USER 10001:10001
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8787/api/blogger/health').then((response)=>{if(!response.ok)process.exit(1)}).catch(()=>process.exit(1))"]

ENTRYPOINT ["/app/deploy/docker-entrypoint.sh"]

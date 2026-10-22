FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates gettext-base nginx \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --chown=www-data:www-data . .
RUN mkdir -p /app/content/blog/media /app/.blogger-state \
  && chown -R www-data:www-data /app/content /app/.blogger-state \
  && chmod 0750 /app/content/blog /app/content/blog/media /app/.blogger-state \
  && chmod 0755 /app/deploy/docker-entrypoint.sh

ENV NODE_ENV=production \
    PORT=8787 \
    NGINX_LISTEN=8080 \
    PUBLIC_ROOT=/app/.blogger-state/public/current \
    BLOGGER_UPSTREAM=127.0.0.1:8787 \
    NGINX_PID=/app/.blogger-state/nginx.pid

EXPOSE 8080
VOLUME ["/app/content/blog", "/app/.blogger-state"]

USER www-data
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:8080/api/blogger/health').then((response)=>{if(!response.ok)process.exit(1)}).catch(()=>process.exit(1))"]

ENTRYPOINT ["/app/deploy/docker-entrypoint.sh"]

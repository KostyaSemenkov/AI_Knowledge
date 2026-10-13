FROM nginx:1.30.5-alpine

COPY docker-entrypoint.sh /usr/local/bin/neuroshift-entrypoint.sh
RUN addgroup -g 1000 appuser \
    && adduser -u 1000 -G appuser -s /bin/sh -D appuser \
    && chmod 755 /usr/local/bin/neuroshift-entrypoint.sh

COPY nginx.conf /etc/nginx/neuroshift.conf.template
COPY --chown=1000:1000 index.html /usr/share/nginx/html/index.html
COPY --chown=1000:1000 assets/styles.css assets/app.js assets/data.js assets/icons.svg assets/favicon.svg /usr/share/nginx/html/assets/
COPY --chown=1000:1000 assets/LUCIDE-LICENSE.txt /usr/share/nginx/html/assets/LUCIDE-LICENSE.txt
COPY --chown=1000:1000 assets/media/ /usr/share/nginx/html/assets/media/
COPY --chown=1000:1000 assets/materials/ /usr/share/nginx/html/assets/materials/

USER 1000:1000
EXPOSE 8080
STOPSIGNAL SIGQUIT
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -T 2 -O /dev/null "http://127.0.0.1:${PORT:-8080}/healthz" || exit 1

ENTRYPOINT ["/usr/local/bin/neuroshift-entrypoint.sh"]

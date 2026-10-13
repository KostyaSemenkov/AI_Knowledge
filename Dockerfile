FROM nginx:1.30.5-alpine

COPY nginx.conf /etc/nginx/nginx.conf
COPY --chown=101:101 index.html /usr/share/nginx/html/index.html
COPY --chown=101:101 assets/styles.css assets/app.js assets/data.js assets/icons.svg assets/favicon.svg /usr/share/nginx/html/assets/
COPY --chown=101:101 assets/LUCIDE-LICENSE.txt /usr/share/nginx/html/assets/LUCIDE-LICENSE.txt
COPY --chown=101:101 assets/media/ /usr/share/nginx/html/assets/media/
COPY --chown=101:101 assets/materials/ /usr/share/nginx/html/assets/materials/

USER 101:101
EXPOSE 8080
STOPSIGNAL SIGQUIT
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -T 2 -O /dev/null http://127.0.0.1:8080/healthz || exit 1

ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]

#!/bin/sh
set -eu

PORT="${PORT:-8080}"
case "$PORT" in
    *[!0-9]*) echo "PORT must be a number between 1 and 65535" >&2; exit 1 ;;
esac
if [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then
    echo "PORT must be a number between 1 and 65535" >&2
    exit 1
fi
export PORT

# Substitute only PORT, preserving Nginx variables such as $uri.
envsubst '${PORT}' < /etc/nginx/neuroshift.conf.template > /tmp/neuroshift-nginx.conf
exec nginx -c /tmp/neuroshift-nginx.conf -g 'daemon off;'

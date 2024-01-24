# Create runtime (public) container
FROM node:21.6.0-alpine3.19

LABEL maintainer="phish108 <cpglahn@gmail.com>"
LABEL org.opencontainers.image.source="https://github.com/sustainability-zhaw/clearindex"

COPY package*.json /app/
COPY src /app/src/

WORKDIR /app
RUN adduser -S sdgservice && \
    npm ci --omit dev && \
    chown -R sdgservice /app

USER sdgservice
ENTRYPOINT [ "/usr/local/bin/npm", "start", "-q" ]

# Fretron — a static site. There is no backend: scores and settings live in the
# browser. The build stage typechecks and bundles; the runtime stage is nginx
# serving one HTML file, the service worker, the manifest and the icons.

# --- build stage -------------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json tsconfig.json vite.config.ts vitest.config.ts ./
RUN npm ci
COPY src ./src
COPY public ./public
COPY index.html ./
# tsconfig includes test/ and tools/, which are not copied; tsc is happy with
# include patterns that match nothing.
RUN npx tsc --noEmit && npx vite build

# --- runtime stage -----------------------------------------------------------
FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
# The service worker and the page must never be cached by the HTTP layer, or an
# installed copy cannot see an update.
RUN printf '%s\n' \
    'server {' \
    '  listen 80;' \
    '  root /usr/share/nginx/html;' \
    '  location = /index.html { add_header Cache-Control "no-cache"; }' \
    '  location = /sw.js { add_header Cache-Control "no-cache"; }' \
    '  location / { try_files $uri $uri/ /index.html; }' \
    '}' > /etc/nginx/conf.d/default.conf
EXPOSE 80

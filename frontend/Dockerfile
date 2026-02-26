FROM node:22-alpine AS admin-build
WORKDIR /build
COPY app/web/admin ./admin
COPY app/web/admin.jsx ./admin.jsx
RUN npm init -y >/dev/null 2>&1 \
  && npm install --silent esbuild@0.25.10 \
  && npx esbuild admin/index.jsx --bundle --loader:.jsx=jsx --format=iife --target=es2018 --outfile=admin.js

FROM nginx:1.27-alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY app/web/ /usr/share/nginx/html/
COPY --from=admin-build /build/admin.js /usr/share/nginx/html/admin.js
RUN cp /usr/share/nginx/html/landing.html /usr/share/nginx/html/index.html

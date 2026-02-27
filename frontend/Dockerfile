FROM node:22-alpine AS frontend-build
WORKDIR /build
COPY app/web/admin ./admin
COPY app/web/admin.jsx ./admin.jsx
COPY app/web/client ./client
COPY app/web/client.jsx ./client.jsx
RUN npm init -y >/dev/null 2>&1 \
  && npm install --silent esbuild@0.25.10 \
  && npx esbuild admin/index.jsx --bundle --loader:.jsx=jsx --format=iife --target=es2018 --outfile=admin.js \
  && npx esbuild client/index.jsx --bundle --loader:.jsx=jsx --format=iife --target=es2018 --outfile=client.js

FROM nginx:1.27-alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY app/web/ /usr/share/nginx/html/
COPY --from=frontend-build /build/admin.js /usr/share/nginx/html/admin.js
COPY --from=frontend-build /build/client.js /usr/share/nginx/html/client.js
RUN cp /usr/share/nginx/html/landing.html /usr/share/nginx/html/index.html

FROM node:22-alpine AS frontend-build
# node_modules живут в /build/ — тогда они видны из /build/app/web/
WORKDIR /build
COPY frontend/package.json ./
RUN npm install --silent
COPY app/web app/web
COPY frontend/vite.config.ts frontend/
COPY frontend/tsconfig.json frontend/
WORKDIR /build/frontend
RUN npx vite build

FROM nginx:1.27-alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY app/web/ /usr/share/nginx/html/
COPY --from=frontend-build /build/frontend/dist/ /usr/share/nginx/html/
RUN cp /usr/share/nginx/html/landing.html /usr/share/nginx/html/index.html

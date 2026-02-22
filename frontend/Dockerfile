FROM nginx:1.27-alpine
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY app/web/ /usr/share/nginx/html/
RUN cp /usr/share/nginx/html/landing.html /usr/share/nginx/html/index.html

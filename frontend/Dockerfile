FROM nginx:1.27-alpine AS runtime
COPY index.html /usr/share/nginx/html/index.html
COPY style.css /usr/share/nginx/html/style.css
COPY script.js /usr/share/nginx/html/script.js
COPY favicon.svg /usr/share/nginx/html/favicon.svg
COPY favicon-32.png /usr/share/nginx/html/favicon-32.png
COPY icon-192.png /usr/share/nginx/html/icon-192.png
COPY icon-512.png /usr/share/nginx/html/icon-512.png
COPY apple-touch-icon.png /usr/share/nginx/html/apple-touch-icon.png
COPY site.webmanifest /usr/share/nginx/html/site.webmanifest
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

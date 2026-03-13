# Dockerfile para frontend (React + Vite)
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* .
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY certs/localhost+3.pem /etc/nginx/certs/localhost+3.pem
COPY certs/localhost+3-key.pem /etc/nginx/certs/localhost+3-key.pem
EXPOSE 80
EXPOSE 443
CMD ["nginx", "-g", "daemon off;"]

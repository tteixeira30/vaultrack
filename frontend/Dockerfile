# 24 é a LTS atual (o Dependabot propunha 25, que é versão ímpar/non-LTS)
FROM node:25-alpine AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
RUN npm run build

# variante oficial do nginx preparada para correr sem root (escuta em 8080)
FROM nginxinc/nginx-unprivileged:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
USER nginx
EXPOSE 8080

# --- Build stage ---
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Vite bakes VITE_* vars into the bundle at build time, not runtime, so this
# has to be a build ARG rather than a container runtime environment variable.
ARG VITE_SOCKET_URL=http://localhost:4000
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL

RUN npm run build

# --- Runtime stage: static files served by nginx ---
FROM nginx:alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

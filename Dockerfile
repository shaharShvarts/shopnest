# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
ARG SHOPNEST_DEPLOYMENT_ID
ENV SHOPNEST_DEPLOYMENT_ID=$SHOPNEST_DEPLOYMENT_ID
COPY . .
RUN npm install && npm run build


# Stage 2: Serve
FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app ./
RUN npm install --production
EXPOSE 3000
CMD ["npm", "start"]
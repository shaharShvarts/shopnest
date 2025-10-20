# Stage 1: Build
FROM node:18-alpine AS builder
WORKDIR /app
COPY . .
RUN npm install && npm run build

# Stage 2: Serve
FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app ./
RUN npm install --production
EXPOSE 3000
CMD ["npm", "start"]
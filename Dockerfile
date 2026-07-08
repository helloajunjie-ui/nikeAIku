# ============================================================
# Dockerfile — NIKO酒馆 多阶段构建
# ============================================================

# ---- Stage 1: Build Go Backend ----
FROM golang:1.22-alpine AS backend-builder

WORKDIR /build
COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend/ .
RUN CGO_ENABLED=1 GOOS=linux go build -o /build/server ./cmd/server/

# ---- Stage 2: Build Frontend ----
FROM node:20-alpine AS frontend-builder

WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ .
RUN npm run build

# ---- Stage 3: Runtime ----
FROM alpine:3.19

RUN apk add --no-cache ca-certificates sqlite

WORKDIR /app

# 后端二进制
COPY --from=backend-builder /build/server ./server

# 前端静态文件
COPY --from=frontend-builder /build/dist ./dist

# 数据目录
RUN mkdir -p /app/data/images

EXPOSE 8080

ENV GIN_MODE=release
ENV SERVER_PORT=8080
ENV DB_PATH=/app/data/niko-tavern.db
ENV IMAGE_DIR=/app/data/images

CMD ["./server"]

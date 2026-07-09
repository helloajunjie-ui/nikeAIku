# ============================================================
# Dockerfile — NIKO酒馆 后端 (Go + SQLite)
# ============================================================

# ---- Stage 1: Build ----
FROM golang:1.22-alpine AS builder

WORKDIR /build
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=1 GOOS=linux go build -o /build/server ./cmd/server/

# ---- Stage 2: Runtime ----
FROM alpine:3.19

RUN apk add --no-cache ca-certificates sqlite

WORKDIR /app

COPY --from=builder /build/server ./server

RUN mkdir -p /app/data/images

EXPOSE 8080

ENV GIN_MODE=release
ENV SERVER_PORT=8080
ENV DB_PATH=/app/data/niko-tavern.db
ENV IMAGE_DIR=/app/data/images

CMD ["./server"]

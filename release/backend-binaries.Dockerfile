FROM rust:1.91-alpine AS builder

ARG TARGETARCH

RUN apk add --no-cache build-base pkgconfig perl clang lld musl-dev ca-certificates curl

RUN case "${TARGETARCH}" in \
      amd64) rustup target add x86_64-unknown-linux-musl ;; \
      arm64) rustup target add aarch64-unknown-linux-musl ;; \
      *) echo "Unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1 ;; \
    esac

WORKDIR /usr/src/grengin-api

COPY Cargo.* ./
COPY migration/Cargo.toml migration/Cargo.toml
COPY sqlx-mcp/Cargo.toml sqlx-mcp/Cargo.toml
RUN mkdir -p src migration/src sqlx-mcp/src \
 && echo "fn main(){}" > src/main.rs \
 && echo "" > migration/src/lib.rs \
 && echo "fn main(){}" > sqlx-mcp/src/main.rs \
 && cargo fetch --locked

COPY src ./src
COPY migration ./migration
COPY sqlx-mcp ./sqlx-mcp
COPY swagger-overrides /swagger-overrides

ENV CARGO_BUILD_JOBS=2
ENV RUSTFLAGS="-C target-feature=+crt-static"
ENV SWAGGER_UI_OVERWRITE_FOLDER=/swagger-overrides

RUN case "${TARGETARCH}" in \
      amd64) RUST_TARGET="x86_64-unknown-linux-musl" ;; \
      arm64) RUST_TARGET="aarch64-unknown-linux-musl" ;; \
      *) echo "Unsupported TARGETARCH: ${TARGETARCH}" >&2; exit 1 ;; \
    esac \
 && cargo build --release --locked --target "${RUST_TARGET}" -p grengin-api -p sqlx-mcp \
 && cp "target/${RUST_TARGET}/release/grengin-api" /usr/local/bin/grengin-api \
 && cp "target/${RUST_TARGET}/release/sqlx-mcp" /usr/local/bin/sqlx-mcp

RUN strip /usr/local/bin/grengin-api /usr/local/bin/sqlx-mcp

FROM scratch
LABEL org.opencontainers.image.licenses="Apache-2.0"
COPY --from=builder /usr/local/bin/grengin-api /usr/local/bin/grengin-api
COPY --from=builder /usr/local/bin/sqlx-mcp /usr/local/bin/sqlx-mcp

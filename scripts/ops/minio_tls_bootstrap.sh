#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OUT_DIR="${1:-$ROOT_DIR/deploy/tls/minio}"
CA_CN="${MINIO_TLS_CA_CN:-Law Internal MinIO CA}"
SERVER_CN="${MINIO_TLS_SERVER_CN:-minio}"
VALID_DAYS="${MINIO_TLS_VALID_DAYS:-825}"
OVERWRITE="${MINIO_TLS_OVERWRITE:-false}"

mkdir -p "$OUT_DIR"

prepare_output_path() {
  local path="$1"
  if [[ -d "$path" ]]; then
    if [[ "$OVERWRITE" == "true" ]]; then
      rm -rf "$path"
      return 0
    fi
    echo "[ERROR] $path is a directory. Set MINIO_TLS_OVERWRITE=true to replace it." >&2
    exit 1
  fi
  if [[ -f "$path" ]]; then
    if [[ "$OVERWRITE" == "true" ]]; then
      rm -f "$path"
      return 0
    fi
    echo "[ERROR] $path already exists. Set MINIO_TLS_OVERWRITE=true to regenerate." >&2
    exit 1
  fi
}

for required in ca.crt ca.key public.crt private.key; do
  prepare_output_path "$OUT_DIR/$required"
done

if ! command -v openssl >/dev/null 2>&1; then
  echo "[ERROR] openssl not found" >&2
  exit 1
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

cat > "$tmp_dir/server.cnf" <<CFG
[req]
default_bits = 4096
prompt = no
default_md = sha256
distinguished_name = dn
req_extensions = req_ext

[dn]
CN = ${SERVER_CN}

[req_ext]
subjectAltName = @alt_names

[alt_names]
DNS.1 = minio
DNS.2 = law-minio
DNS.3 = localhost
IP.1 = 127.0.0.1
CFG

echo "[1/4] Generating internal CA..."
openssl genrsa -out "$OUT_DIR/ca.key" 4096 >/dev/null 2>&1
openssl req -x509 -new -nodes -key "$OUT_DIR/ca.key" -sha256 -days 3650 \
  -out "$OUT_DIR/ca.crt" -subj "/CN=${CA_CN}" >/dev/null 2>&1

echo "[2/4] Generating MinIO server key + CSR..."
openssl genrsa -out "$OUT_DIR/private.key" 4096 >/dev/null 2>&1
openssl req -new -key "$OUT_DIR/private.key" -out "$tmp_dir/server.csr" -config "$tmp_dir/server.cnf" >/dev/null 2>&1

echo "[3/4] Signing MinIO server certificate with internal CA..."
openssl x509 -req -in "$tmp_dir/server.csr" \
  -CA "$OUT_DIR/ca.crt" -CAkey "$OUT_DIR/ca.key" -CAcreateserial \
  -out "$tmp_dir/server.crt" -days "$VALID_DAYS" -sha256 \
  -extensions req_ext -extfile "$tmp_dir/server.cnf" >/dev/null 2>&1

cat "$tmp_dir/server.crt" "$OUT_DIR/ca.crt" > "$OUT_DIR/public.crt"

chmod 600 "$OUT_DIR/ca.key" "$OUT_DIR/private.key"
chmod 644 "$OUT_DIR/ca.crt" "$OUT_DIR/public.crt"

echo "[4/4] Done. Generated files:"
echo "  - $OUT_DIR/ca.crt"
echo "  - $OUT_DIR/ca.key"
echo "  - $OUT_DIR/public.crt"
echo "  - $OUT_DIR/private.key"
echo
echo "Use in production .env:"
echo "  MINIO_TLS_ENABLED=true"
echo "  S3_ENDPOINT=https://minio:9000"
echo "  S3_USE_SSL=true"
echo "  S3_VERIFY_SSL=true"
echo "  S3_CA_CERT_PATH=/etc/ssl/minio/ca.crt"

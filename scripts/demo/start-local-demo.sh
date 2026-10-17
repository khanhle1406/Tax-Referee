#!/usr/bin/env bash
# Chạy demo LOCAL cho buổi trình bày: mỗi phiên demo mới có sẵn lô mẫu (TAX_REFEREE_DEMO_PRESET_BATCHES=1),
# Gmail/Zalo chạy chế độ mô phỏng. Dùng:  npm run demo:local            (dùng bản build sẵn có)
#                                          npm run demo:local -- --build (build lại trước)
set -e
cd "$(dirname "$0")/../.."
if [ "$1" = "--build" ]; then npm run build; fi
rm -rf .next/standalone/.next/static .next/standalone/public
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
DATA_DIR=$(mktemp -d)
echo "Tax Referee demo local: http://127.0.0.1:${PORT:-3060}  (dữ liệu tạm: $DATA_DIR — tắt và chạy lại là phiên sạch)"
PORT=${PORT:-3060} HOSTNAME=127.0.0.1 NODE_ENV=production TAX_REFEREE_DATA_DIR="$DATA_DIR" TAX_REFEREE_DEMO_PRESET_BATCHES=1 \
  node .next/standalone/server.js

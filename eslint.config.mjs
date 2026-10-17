import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });
const config = [
  { ignores: ['.next*/**', 'node_modules/**', 'data/runtime/**', 'data/uploads/**', 'backups/**', '.codex-finalizer/**', 'docs/evidence/**', 'scratch/**', 'Python/**', 'NOP-BAI-*/**'] },
  ...compat.extends('next/core-web-vitals'),
  // Chuỗi nháy đơn chứa ${…} hiện nguyên văn ra giao diện (lỗi đã gặp ở lời giải thích quy tắc).
  { rules: { 'no-template-curly-in-string': 'error' } },
];

export default config;

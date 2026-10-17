import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { z } from 'zod';
import { DemoSupplierSchema, demoSupplierCatalogPath, writeDemoSupplierCatalog } from '../../lib/server/demoSupplierCatalog';

// No environment-file loader: this command needs no API key and never calls AI.
const root = path.resolve('input-sample');
const entries = z.array(DemoSupplierSchema).parse(JSON.parse(fs.readFileSync(path.join(root, 'demo-suppliers.json'), 'utf8')));
const manifest = z.object({items: z.array(z.object({file: z.string(), sha256: z.string()}))})
  .parse(JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8')));
for (const entry of entries) for (const file of entry.files) {
  const item = manifest.items.find(row => row.file === file);
  if (!item || path.basename(file) !== file) throw new Error(`Chưa có nguồn trong manifest: ${file}`);
  const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
  if (hash !== item.sha256) throw new Error(`Chứng từ đã thay đổi; cần rà soát lại tên/MST: ${file}`);
}
const count = writeDemoSupplierCatalog(entries);
console.log(`Đã lưu ${count} nhà cung cấp / ${new Set(entries.flatMap(entry => entry.files)).size} chứng từ vào ${demoSupplierCatalogPath()}`);
console.log('Chỉ dùng trong phiên demo; không là xác minh chính thống, không xác nhận trạng thái hoạt động.');

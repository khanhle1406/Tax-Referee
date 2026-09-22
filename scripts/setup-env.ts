import fs from 'fs';
import path from 'path';

/**
 * Tự động nạp biến môi trường từ .env.local và .env khi chạy scripts CLI qua tsx / node
 */
export function loadLocalEnv() {
  const envFiles = ['.env.local', '.env'];
  for (const file of envFiles) {
    const envPath = path.resolve(process.cwd(), file);
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      for (const line of envContent.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx !== -1) {
            const key = trimmed.slice(0, eqIdx).trim();
            const val = trimmed.slice(eqIdx + 1).trim();
            if (key && !process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      }
    }
  }
}

loadLocalEnv();

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';

/**
 * Render trang đầu của tài liệu PDF sang định dạng hình ảnh PNG (Base64)
 * Hỗ trợ native macOS QuickLook (qlmanage) và fallback sang PyMuPDF (fitz)
 */
export function convertPdfToPngBase64(pdfBuffer: Buffer): string {
  const tmpId = crypto.randomUUID();
  const tmpPdfPath = path.join(os.tmpdir(), `tax-referee-${tmpId}.pdf`);
  const tmpOutDir = os.tmpdir();
  const expectedPngPath = path.join(tmpOutDir, `tax-referee-${tmpId}.pdf.png`);

  try {
    fs.writeFileSync(tmpPdfPath, pdfBuffer);

    let converted = false;

    // 1. Thử dùng qlmanage của macOS (siêu nhanh ~100-300ms)
    try {
      execSync(`qlmanage -t -s 1500 -o "${tmpOutDir}" "${tmpPdfPath}"`, {
        stdio: 'pipe',
        timeout: 5000
      });
      if (fs.existsSync(expectedPngPath) && fs.statSync(expectedPngPath).size > 0) {
        converted = true;
      }
    } catch {
      // Bỏ qua lỗi và chuyển sang phương pháp Python
    }

    // 2. Fallback sang Python PyMuPDF nếu qlmanage không tạo file
    if (!converted) {
      const pythonPngPath = path.join(tmpOutDir, `tax-referee-${tmpId}.png`);
      try {
        execSync(
          `python3 -c "import fitz, sys; doc=fitz.open(sys.argv[1]); doc[0].get_pixmap(dpi=150).save(sys.argv[2])" "${tmpPdfPath}" "${pythonPngPath}"`,
          { stdio: 'pipe', timeout: 8000 }
        );
        if (fs.existsSync(pythonPngPath) && fs.statSync(pythonPngPath).size > 0) {
          const pngBuf = fs.readFileSync(pythonPngPath);
          fs.unlinkSync(pythonPngPath);
          return pngBuf.toString('base64');
        }
      } catch (pyErr) {
        console.warn('[PDF Converter] Python fitz fallback error:', pyErr);
      }
    }

    if (fs.existsSync(expectedPngPath)) {
      const pngBuf = fs.readFileSync(expectedPngPath);
      fs.unlinkSync(expectedPngPath);
      return pngBuf.toString('base64');
    }

    throw new Error('Không thể render trang PDF sang PNG để thực hiện Vision OCR');
  } finally {
    if (fs.existsSync(tmpPdfPath)) {
      try {
        fs.unlinkSync(tmpPdfPath);
      } catch {
        // ignore
      }
    }
  }
}

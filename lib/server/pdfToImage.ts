import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import sharp from 'sharp';

/** Chỉ chuyển các biến cần để chạy Python (đường dẫn, mã hóa, thư mục tạm); mọi biến khác — gồm khóa bí mật — bị bỏ. */
const PDF_CHILD_ENV_KEYS = ['PATH', 'PYTHONPATH', 'LANG', 'LC_ALL', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot', 'SYSTEMROOT', 'windir', 'PATHEXT', 'COMSPEC'];
export function pdfChildEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = { PYTHONIOENCODING: 'utf-8' };
  for (const key of PDF_CHILD_ENV_KEYS) { const value = env[key]; if (value !== undefined) out[key] = value; }
  return out;
}

/**
 * Trích xuất text trực tiếp từ Digital PDF (hóa đơn điện tử PDF vector).
 * Tốc độ thực thi cực nhanh (< 30ms), hoàn toàn không cần qua OCR hình ảnh.
 */

export function extractTextFromPdfBuffer(pdfBuffer: Buffer): string | null {
  // Thư mục tạm riêng (mkdtemp: quyền 700 trên POSIX) và file chỉ chủ sở hữu đọc được: user khác trên cùng host
  // không đọc được chứng từ trong /tmp dùng chung, không đặt sẵn file hay symlink được (CodeQL js/insecure-temporary-file).
  let tmpDir: string | undefined;

  try {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tax-referee-text-'));
    const tmpPdfPath = path.join(tmpDir, 'input.pdf');
    fs.writeFileSync(tmpPdfPath, pdfBuffer, { flag: 'wx', mode: 0o600 });

    // Dùng Python PyMuPDF (fitz) hoặc pypdf có sẵn trên máy để đọc trực tiếp text stream
    const pyScript = `
import sys
text = ""
try:
    import fitz
    doc = fitz.open(sys.argv[1])
    for page in doc:
        text += page.get_text() + "\\n"
except Exception:
    try:
        from pypdf import PdfReader
        reader = PdfReader(sys.argv[1])
        for page in reader.pages:
            text += (page.extract_text() or "") + "\\n"
    except Exception:
        pass
sys.stdout.write(text.strip())
`;

    const output = execSync(`python3 -c '${pyScript.replace(/'/g, "'\\''")}' "${tmpPdfPath}"`, {
      encoding: 'utf-8',
      timeout: 3000,
      maxBuffer: 4 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'ignore'],
      // Cách ly tối thiểu: tiến trình đọc PDF không tin cậy KHÔNG thừa hưởng khóa API, khóa audit hay mật khẩu trong env.
      env: pdfChildEnv(process.env) as unknown as NodeJS.ProcessEnv
    });

    const cleanText = (output || '').trim();
    if (cleanText.length >= 40) {
      return cleanText;
    }
  } catch (err: any) {
    console.warn('[PDF Extractor] Lỗi đọc text stream trực tiếp từ PDF:', err?.message);
  } finally {
    try {
      if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    } catch {
      // Không để lỗi dọn dẹp (Windows: tiến trình con còn giữ thư mục) làm hỏng lượt đọc; thư mục chỉ chủ sở hữu truy cập được.
    }
  }

  return null;
}

/**
 * Tối ưu hóa kích thước và độ phân giải hình ảnh trước khi gửi sang mô hình Vision.
 * Mặc định scale về cạnh tối đa 1000px và nén JPEG quality 80. Có thể thử profile
 * nhanh hơn bằng DOCUMENT_IMAGE_MAX_DIM=800 và DOCUMENT_IMAGE_JPEG_QUALITY=70,
 * nhưng phải chạy lại bộ accuracy trước khi bật production.
 */
export async function optimizeImageBuffer(
  imageBuffer: Buffer,
  mimeType: string
): Promise<{ buffer: Buffer; mimeType: string }> {
  // Small PNGs are often clean scans with sharp text. Re-encoding them as JPEG
  // can introduce ringing around digits and makes the OCR result worse while
  // saving almost no upload time.
  if (imageBuffer.byteLength <= 128 * 1024 && mimeType === 'image/png') {
    return { buffer: imageBuffer, mimeType };
  }
  const maxDimension = Math.min(1600, Math.max(480, Number(process.env.DOCUMENT_IMAGE_MAX_DIM || 1000)));
  const jpegQuality = Math.min(92, Math.max(55, Number(process.env.DOCUMENT_IMAGE_JPEG_QUALITY || 80)));
  try {
    const buffer = await sharp(imageBuffer, { limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: maxDimension, height: maxDimension, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: jpegQuality, mozjpeg: true })
      .toBuffer();
    return { buffer, mimeType: 'image/jpeg' };
  } catch {
    return { buffer: imageBuffer, mimeType };
  }
}

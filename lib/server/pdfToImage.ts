import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import sharp from 'sharp';

/** Chỉ chuyển các biến cần để chạy Python (đường dẫn, mã hóa, thư mục tạm); mọi biến khác — gồm khóa bí mật — bị bỏ. */
const PDF_CHILD_ENV_KEYS = ['PATH', 'PYTHONPATH', 'LANG', 'LC_ALL', 'HOME', 'TMPDIR', 'TEMP', 'TMP', 'SystemRoot', 'SYSTEMROOT', 'windir', 'PATHEXT', 'COMSPEC'];
export function pdfChildEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = { PYTHONIOENCODING: 'utf-8' };
  for (const key of PDF_CHILD_ENV_KEYS) { const value = env[key]; if (value !== undefined) out[key] = value; }
  return out;
}

/**
 * Đọc lớp chữ có sẵn trong PDF theo thứ tự hiển thị, giữ ranh giới trang.
 * Không dùng OCR; lớp chữ hỗ trợ AI đối chiếu với bố cục PDF gốc.
 */

export function extractTextFromPdfBuffer(pdfBuffer: Buffer): string | null {
  const tmpId = crypto.randomUUID();
  const tmpPdfPath = path.join(os.tmpdir(), `tax-referee-text-${tmpId}.pdf`);

  try {
    fs.writeFileSync(tmpPdfPath, pdfBuffer);

    // Dùng Python PyMuPDF (fitz) hoặc pypdf có sẵn trên máy để đọc trực tiếp text stream
    const pyScript = `
import sys
text = ""
try:
    import fitz
    doc = fitz.open(sys.argv[1])
    for index, page in enumerate(doc):
        text += "[Trang " + str(index + 1) + "]\\n" + page.get_text(sort=True) + "\\n"
except Exception:
    try:
        from pypdf import PdfReader
        reader = PdfReader(sys.argv[1])
        for index, page in enumerate(reader.pages):
            text += "[Trang " + str(index + 1) + "]\\n" + (page.extract_text() or "") + "\\n"
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
    if (fs.existsSync(tmpPdfPath)) {
      try {
        fs.unlinkSync(tmpPdfPath);
      } catch {
        // ignore
      }
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

/**
 * Render trang đầu của tài liệu PDF sang định dạng hình ảnh PNG (Base64)
 * Chỉ dùng khi PDF là bản scan (không có text stream).
 */
export function convertPdfToPngBase64(pdfBuffer: Buffer): string {
  const tmpId = crypto.randomUUID();
  const tmpPdfPath = path.join(os.tmpdir(), `tax-referee-${tmpId}.pdf`);
  const tmpOutDir = os.tmpdir();
  const expectedPngPath = path.join(tmpOutDir, `tax-referee-${tmpId}.pdf.png`);

  try {
    fs.writeFileSync(tmpPdfPath, pdfBuffer);

    let converted = false;

    // 1. Thử dùng qlmanage của macOS
    try {
      execSync(`qlmanage -t -s 1500 -o "${tmpOutDir}" "${tmpPdfPath}"`, {
        stdio: 'pipe',
        timeout: 5000
      });
      if (fs.existsSync(expectedPngPath) && fs.statSync(expectedPngPath).size > 0) {
        converted = true;
      }
    } catch {
      // Fallback
    }

    // 2. Fallback sang PyMuPDF
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

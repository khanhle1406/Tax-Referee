import { assertValidXml, parseXml, sanitizeInvoice } from '@/lib/documentParser';
import { requireRequestUser } from '@/lib/server/auth';
import { allowVisionCall } from '@/lib/server/aiBudget';
import { artifactRoot } from '@/lib/server/db';
import { withRequestDatabase } from '@/lib/server/db';
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DocumentExtraction, DocumentExtractionSchema } from '@/lib/schemas';
import { getDatabase, jsonNow } from '@/lib/server/db';
import {assertArtifactCapacity,ArtifactQuotaError} from '@/lib/server/artifactQuota';

import { parseInvoiceFromRawText } from '@/lib/rawTextParser';
import { validateTaxCode } from '@/lib/taxCode';
import { lookupOfficialSupplierIdentity } from '@/services/officialSupplierLookupService';
import { screenInvoiceImage, imageScreeningMessage } from '@/services/invoiceImagePreflight';
import { extractInvoiceImageWithGeminiVision } from '@/services/geminiService';
import { extractTextFromPdfBuffer, optimizeImageBuffer } from '@/lib/server/pdfToImage';
import { SHOPAIKEY_GEMINI_API_CONFIG } from '@/lib/constants';
import { validateInvoiceMathematics } from '@/lib/invoiceMathValidator';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Stored in the current request database: never reuse another session's artifact/review.
// `xml-canon-1` + `v6` (đọc thẻ HTTToan): bộ đọc XML chuẩn hóa CDATA/chú thích/PI/tham chiếu ký tự — bỏ kết quả cache trích xuất trước đó.
const extractionVersion = `shopaikey-gemini-vision-identity-resolver-v6:xml-canon-1:${SHOPAIKEY_GEMINI_API_CONFIG.MODEL}:${process.env.DOCUMENT_IMAGE_MAX_DIM || '1000'}-q${process.env.DOCUMENT_IMAGE_JPEG_QUALITY || '80'}`;
function getCachedDocumentResult(hash: string) {
  const row = getDatabase().prepare(`SELECT r.payload_json FROM document_artifacts a
    JOIN extraction_reviews r ON r.artifact_id=a.id WHERE a.content_hash=?`).get(hash) as {payload_json:string}|undefined;
  if (!row) return null;
  try {
    const stored = JSON.parse(row.payload_json);
    if (stored.extractionVersion !== extractionVersion) return null;
    const result = DocumentExtractionSchema.safeParse(stored.cachedResult);
    return result.success ? result.data : null;
  } catch { return null; }
}
function extractionResponse(result: unknown, started: number, cacheHit=false) {
  const totalMs = Math.round(performance.now()-started);
  return NextResponse.json({ ...(result as object), performance:{totalMs,cacheHit} },
    { headers:{'Server-Timing':`extraction;dur=${totalMs}`, 'Cache-Control':'no-store'} });
}

function supplierIdentityReview(identity: Awaited<ReturnType<typeof lookupOfficialSupplierIdentity>> | undefined, source: 'XML' | 'PDF_TEXT' | 'VLM' | 'USER') {
  const hasConflict = identity?.status === 'CONFLICT';
  const note = identity?.message || 'MST in trên hóa đơn chưa khớp nhà cung cấp.';
  return {
    // MST mâu thuẫn với danh tính đã xác minh không được coi là dữ liệu chắc chắn: workflow phải hỏi lại.
    uncertainFields: hasConflict ? ['supplierTaxCode'] : [] as string[],
    conflicts: hasConflict ? [note] : [],
    fieldWarnings: {} as Record<string, string>,
    fieldEvidence: hasConflict ? { supplierTaxCode: {
      source,
      status: 'CONFLICT' as const,
      confidence: 0.6
    } } : {}
  };
}

async function verifySupplierIdentity(invoice: Record<string, unknown>) {
  const supplierName = typeof invoice.supplierName === 'string' ? invoice.supplierName : '';
  const supplierTaxCode = typeof invoice.supplierTaxCode === 'string' ? invoice.supplierTaxCode : '';
  const address = typeof invoice.supplierAddress === 'string' ? invoice.supplierAddress : '';
  if (!supplierName.trim() && !supplierTaxCode.trim()) return { identity: undefined, trustedDerivedFields: [] as string[] };
  const identity = await lookupOfficialSupplierIdentity({ supplierName, supplierTaxCode, address });
  const trustedDerivedFields: string[] = [];
  if (identity.status === 'VERIFIED' && identity.legalName && identity.supplierTaxCode) {
    invoice.supplierName = identity.legalName;
    invoice.supplierTaxCode = identity.supplierTaxCode;
    trustedDerivedFields.push('supplierName', 'supplierTaxCode');
  }
  return { identity, trustedDerivedFields };
}

// Recheck supplier freshness without calling Vision again for the same image.
// Keep the original extracted name/MST as the query, rather than a previous
// canonical result that could hide a mismatch on a later registry refresh.
async function refreshCachedSupplier(result: DocumentExtraction): Promise<DocumentExtraction> {
  const original = result.supplierIdentity;
  const identity = await lookupOfficialSupplierIdentity({
    supplierName: original?.originalSupplierName ?? result.invoice.supplierName,
    supplierTaxCode: original?.originalSupplierTaxCode ?? result.invoice.supplierTaxCode,
    address: result.invoice.supplierAddress
  });
  const updated: DocumentExtraction = { ...result, invoice: { ...result.invoice }, supplierIdentity: identity,
    fieldEvidence: { ...result.fieldEvidence }, confidence: { ...result.confidence },
    fieldWarnings: { ...result.fieldWarnings } };
  updated.conflicts = (result.conflicts || []).filter(message => message !== original?.message);
  if (identity.status === 'CONFLICT' && identity.message) updated.conflicts.push(identity.message);
  if (identity.status === 'VERIFIED' && identity.legalName && identity.supplierTaxCode) {
    updated.invoice.supplierName = identity.legalName;
    updated.invoice.supplierTaxCode = identity.supplierTaxCode;
    for (const field of ['supplierName', 'supplierTaxCode'] as const) {
      updated.confidence[field] = 1;
      updated.fieldEvidence[field] = { source: 'OFFICIAL_REGISTRY', status: 'VERIFIED', confidence: 1, text: updated.invoice[field] };
      delete updated.fieldWarnings![field];
    }
    updated.uncertainFields = updated.uncertainFields.filter(field => !['supplierName', 'supplierTaxCode'].includes(field));
    updated.absentFields = updated.absentFields.filter(field => !['supplierName', 'supplierTaxCode'].includes(field));
  } else if (original?.status === 'VERIFIED') {
    // Expired cached registry data must not retain its former verified badge.
    updated.invoice.supplierName = original.originalSupplierName ?? '';
    updated.invoice.supplierTaxCode = original.originalSupplierTaxCode ?? '';
    updated.needsReview = true;
    for (const field of ['supplierName', 'supplierTaxCode']) {
      updated.fieldEvidence[field] = { source: result.sourceType === 'XML' ? 'XML' : result.sourceType === 'FORM' ? 'USER' : 'VLM', status: identity.status === 'CONFLICT' && field === 'supplierTaxCode' ? 'CONFLICT' : 'UNCERTAIN', confidence: 0.6 };
      updated.confidence[field] = 0.6;
      updated.uncertainFields = [...new Set([...updated.uncertainFields, field])];
    }
  }
  if (result.artifactId) {
    const db = getDatabase();
    const row = db.prepare('SELECT payload_json FROM extraction_reviews WHERE artifact_id=?').get(result.artifactId) as { payload_json: string } | undefined;
    if (row) {
      const stored = JSON.parse(row.payload_json);
      const inferredFields = identity.status === 'VERIFIED'
        ? (stored.inferredFields || []).filter((field: string) => !['supplierName', 'supplierTaxCode'].includes(field))
        : stored.inferredFields;
      db.prepare('UPDATE extraction_reviews SET payload_json=? WHERE artifact_id=?')
        .run(JSON.stringify({ ...stored, ...updated, invoice: stored.invoice, inferredFields, cachedResult: updated }), result.artifactId);
    }
  }
  return updated;
}


function persistTextExtraction(rawText:string, rawInvoice:Record<string,unknown>, result:any, extractedFields:string[], trustedDerivedFields:string[] = []) {
 const db=getDatabase();const hash=result.sourceHash;
 const prior=db.prepare('SELECT id FROM document_artifacts WHERE content_hash=?').get(hash) as {id:string}|undefined;
 const id=prior?.id || crypto.randomUUID();const directory=artifactRoot();const storage=path.join(directory,`${id}.txt`);
 if(!prior){assertArtifactCapacity(Buffer.byteLength(rawText));fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(storage,rawText,{flag:'wx'});db.prepare('INSERT INTO document_artifacts (id,invoice_id,revision,original_file_name,source_type,mime_type,storage_path,content_hash,byte_size,signature_status,created_at) VALUES (?,?,1,?,?,?,?,?,?,?,?)').run(id,`pending:${id}`,'van-ban.txt','FORM','text/plain',storage,hash,Buffer.byteLength(rawText),'NOT_APPLICABLE',jsonNow());}
 const trustedDerived=new Set(trustedDerivedFields);
 const inferredFields=Object.keys(result.invoice).filter(k=>!extractedFields.includes(k) && !trustedDerived.has(k) && !['isImageBlurry','isAdjustment'].includes(k));
 const uncertainFields=[...new Set([...(result.uncertainFields || []).filter((field:string)=>!trustedDerived.has(field)),...inferredFields])];
 const confidence={...result.confidence};
 const fieldEvidence={...(result.fieldEvidence || {})};
 for(const field of trustedDerived){
   confidence[field]=1;
   fieldEvidence[field]={source:'OFFICIAL_REGISTRY',status:'VERIFIED',confidence:1,text:String(result.invoice[field] ?? '')};
 }
 const output={...result,confidence,fieldEvidence,artifactId:id,uncertainFields,needsReview:true};
 db.prepare('INSERT OR REPLACE INTO extraction_reviews VALUES (?,?)').run(id,JSON.stringify({...output,invoice:rawInvoice,inferredFields,extractionVersion,cachedResult:output}));return output;
}

async function handlePOST(req: NextRequest) {
  const started = performance.now();
  try {
    const user = requireRequestUser(req);
    // Từ chối sớm khi thân yêu cầu quá lớn (file tối đa 15MB + phần bao multipart), trước khi đọc vào bộ nhớ.
    if (Number(req.headers.get('content-length') || 0) > 16 * 1024 * 1024) return NextResponse.json({ error: 'File vượt quá 15MB' }, { status: 413 });
    const visionBudgetExceeded = () => NextResponse.json({ error: 'Đã vượt hạn mức đọc ảnh bằng AI trong giờ này (ngân sách chi phí AI). Hãy nhập tay hoặc tải XML hóa đơn điện tử.' }, { status: 429 });
    const contentType = req.headers.get('content-type') || '';
    let capturedFile: File | null = null;
    if (contentType.includes('application/json')) {
      const body = await req.json();
      const artifactId = typeof body.artifactId === 'string' ? body.artifactId : '';
      if (artifactId) {
        const artifact = getDatabase().prepare(`SELECT original_file_name,mime_type,storage_path,source_type
          FROM document_artifacts WHERE id=?`).get(artifactId) as { original_file_name: string; mime_type: string; storage_path: string; source_type: string } | undefined;
        if (!artifact || artifact.source_type !== 'IMAGE' || !fs.existsSync(artifact.storage_path)) {
          return NextResponse.json({ error: 'Không tìm thấy ảnh chụp cần đọc.' }, { status: 404 });
        }
        capturedFile = new File([fs.readFileSync(artifact.storage_path)], artifact.original_file_name, { type: artifact.mime_type });
      } else {
      const rawText = String(body.rawText || '').trim();
      if (!rawText) return NextResponse.json({ error: 'Nội dung văn bản trống' }, { status: 400 });

      const textHash = crypto.createHash('sha256').update(rawText).digest('hex');
      const cached = getCachedDocumentResult(textHash);
      if (cached) return NextResponse.json(await refreshCachedSupplier(cached));

      const parsedText = parseInvoiceFromRawText(rawText);
      const { invoice, warnings } = sanitizeInvoice(parsedText.invoice);

      const { identity, trustedDerivedFields } = await verifySupplierIdentity(invoice as Record<string, unknown>);

      const combinedWarnings = [
        `Đã bóc tách tự động từ văn bản thô (${parsedText.extractedFields.length} trường nhận diện).`,
        ...warnings
      ];
      const supplierReview = supplierIdentityReview(identity, 'USER');

      const result = DocumentExtractionSchema.parse({
        invoice,
        confidence: Object.fromEntries(Object.keys(invoice).map((key) => [key, parsedText.extractedFields.includes(key) ? 0.95 : 0.7])),
        needsReview: true,
        sourceType: 'FORM',
        sourceHash: textHash,
        supplierIdentity: identity,
        warnings: combinedWarnings,
        ...supplierReview
      });
      return NextResponse.json(persistTextExtraction(rawText,parsedText.invoice as Record<string,unknown>,result,parsedText.extractedFields,trustedDerivedFields));
      }
    }

    const form = capturedFile ? null : await req.formData();
    const rawText = form?.get('rawText');
    if (typeof rawText === 'string' && rawText.trim()) {
      const textHash = crypto.createHash('sha256').update(rawText.trim()).digest('hex');
      const cached = getCachedDocumentResult(textHash);
      if (cached) return NextResponse.json(await refreshCachedSupplier(cached));

      const parsedText = parseInvoiceFromRawText(rawText.trim());
      const { invoice, warnings } = sanitizeInvoice(parsedText.invoice);

      const { identity, trustedDerivedFields } = await verifySupplierIdentity(invoice as Record<string, unknown>);

      const combinedWarnings = [
        `Đã bóc tách tự động từ văn bản thô (${parsedText.extractedFields.length} trường nhận diện).`,
        ...warnings
      ];
      const supplierReview = supplierIdentityReview(identity, 'USER');

      const result = DocumentExtractionSchema.parse({
        invoice,
        confidence: Object.fromEntries(Object.keys(invoice).map((key) => [key, parsedText.extractedFields.includes(key) ? 0.95 : 0.7])),
        needsReview: true,
        sourceType: 'FORM',
        sourceHash: textHash,
        supplierIdentity: identity,
        warnings: combinedWarnings,
        ...supplierReview
      });
      return NextResponse.json(persistTextExtraction(rawText,parsedText.invoice as Record<string,unknown>,result,parsedText.extractedFields,trustedDerivedFields));
    }

    const file = capturedFile || form?.get('file');
    if (!(file instanceof File)) return NextResponse.json({ error: 'Thiếu file chứng từ hoặc văn bản thô' }, { status: 400 });
    if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: 'File vượt quá 15MB' }, { status: 413 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const sourceHash = crypto.createHash('sha256').update(buffer).digest('hex');

    const fileNameLower = file.name.toLowerCase();
    const sourceType = file.type.includes('xml') || fileNameLower.endsWith('.xml')
      ? 'XML'
      : file.type === 'application/pdf' || fileNameLower.endsWith('.pdf')
      ? 'PDF'
      : file.type.startsWith('image/') || fileNameLower.endsWith('.png') || fileNameLower.endsWith('.jpg') || fileNameLower.endsWith('.jpeg') || fileNameLower.endsWith('.webp')
      ? 'IMAGE'
      : null;

    if (!sourceType) return NextResponse.json({ error: 'Chỉ hỗ trợ file XML, PDF và ảnh hóa đơn (PNG, JPG)' }, { status: 415 });

    if (sourceType === 'XML') assertValidXml(buffer.toString('utf8'));
    if (sourceType === 'IMAGE') {
      const screening = await screenInvoiceImage(buffer);
      if (screening.decision === 'REJECT') return NextResponse.json({
        error: imageScreeningMessage(screening), code: 'IMAGE_PREFLIGHT_REJECTED'
      }, { status: 422 });
    }
    const cachedFile = getCachedDocumentResult(sourceHash);
    if (cachedFile && cachedFile.sourceType === sourceType && cachedFile.documentType !== 'NOT_INVOICE') return extractionResponse(await refreshCachedSupplier(cachedFile),started,true);
    if (cachedFile?.documentType === 'NOT_INVOICE') return extractionResponse(cachedFile,started,true);

    const existingArtifact = getDatabase().prepare('SELECT id FROM document_artifacts WHERE content_hash = ?').get(sourceHash) as { id: string } | undefined;
    const artifactId = existingArtifact?.id || crypto.randomUUID();
    const extension = path.extname(file.name).toLowerCase().replace(/[^a-z0-9.]/g, '') || '.bin';
    const artifactDirectory = artifactRoot();
    const storagePath = path.join(artifactDirectory, `${artifactId}${extension}`);

    if (!existingArtifact) {
      assertArtifactCapacity(buffer.byteLength);
      fs.mkdirSync(artifactDirectory, { recursive: true });
      fs.writeFileSync(storagePath, buffer, { flag: 'wx' });
      getDatabase().prepare(`
        INSERT INTO document_artifacts
          (id, invoice_id, revision, original_file_name, source_type, mime_type, storage_path, content_hash, byte_size, signature_status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        artifactId,
        `pending:${artifactId}`,
        1,
        file.name,
        sourceType,
        file.type || 'application/octet-stream',
        storagePath,
        sourceHash,
        buffer.byteLength,
        sourceType === 'XML' ? 'UNVERIFIED' : 'NOT_APPLICABLE',
        jsonNow()
      );
    }

    let rawData: Record<string, unknown> = {};
    let initialWarnings: string[] = [];
    let sourceReadFields: string[] | undefined;
    let documentType: 'INVOICE' | 'NOT_INVOICE' | 'UNCERTAIN' | undefined;
    let usedVision = false;
    // Danh tính và ranh giới của agent đọc ảnh: ghi lại agent nào, prompt nào, và các key bị loại khỏi đầu ra.
    let visionMeta: { droppedKeys: string[]; provenance: unknown } | null = null;

    if (sourceType === 'XML') {
      const parsed = parseXml(buffer.toString('utf8'));
      rawData = parsed.rawInvoice;
      if (parsed.warnings && parsed.warnings.length > 0) {
        initialWarnings.push(...parsed.warnings);
      }
    } else if (sourceType === 'PDF') {
      // HƯỚNG TĂNG TỐC ĐỘT PHÁ: Đọc trực tiếp Text Stream từ Digital PDF (< 50ms)
      const pdfText = extractTextFromPdfBuffer(buffer);
      if (pdfText && pdfText.length >= 50) {
        const parsedPdf = parseInvoiceFromRawText(pdfText);
        if (
          parsedPdf.extractedFields.includes('supplierTaxCode') ||
          parsedPdf.extractedFields.includes('totalAmount') ||
          parsedPdf.extractedFields.includes('invoiceNumber')
        ) {
          rawData = parsedPdf.invoice as Record<string, unknown>;
          // Lớp chữ PDF không phải bằng chứng thanh toán/bảng kê: không cho văn bản trong PDF tự khai các sự kiện này.
          delete rawData.hasBankSlip; delete rawData.hasItemManifest;
          sourceReadFields = parsedPdf.extractedFields.filter(field => field !== 'hasBankSlip' && field !== 'hasItemManifest');
          initialWarnings.push(
            `Đã đọc lớp chữ trực tiếp từ PDF (${parsedPdf.extractedFields.length} trường).`
          );
        }
      }

      // Scanned PDFs have no text layer; send their original PDF bytes to Gemini Vision.
      if (Object.keys(rawData).length === 0) {
        if (!allowVisionCall(user.id)) return visionBudgetExceeded();
        try {
          const vision = await extractInvoiceImageWithGeminiVision(buffer.toString('base64'), 'application/pdf', file.name);
          rawData = vision.data as Record<string, unknown>;
          documentType = vision.documentType;
          sourceReadFields = Object.keys(rawData);
          usedVision = true;
          visionMeta = { droppedKeys: vision.droppedKeys, provenance: vision.provenance };
          initialWarnings.push('Dữ liệu được trích xuất trực tiếp từ PDF bằng Gemini Vision qua ShopAIKey; kế toán vui lòng kiểm tra trước khi thẩm định.');
        } catch (aiError: any) {
          console.error('[Document Parse] Lỗi bóc tách PDF scan qua ShopAIKey Gemini Vision:', aiError);
          return NextResponse.json({
            error: `Lỗi đọc tài liệu PDF từ ShopAIKey Vision: ${aiError?.message || 'Không thể trích xuất dữ liệu từ API'}`
          }, { status: 502 });
        }
      }
    } else {
      // IMAGE: pass the image itself to Gemini Vision; no OCR transcript or worker is used.
      let mimeType = file.type || 'image/jpeg';
      if (!mimeType.startsWith('image/')) mimeType = 'image/jpeg';

      const t_opt0 = Date.now();
      const optimized = await optimizeImageBuffer(buffer, mimeType);
      console.log(`[Parse Perf] Optimize Image: ${Date.now() - t_opt0}ms`);

      if (!allowVisionCall(user.id)) return visionBudgetExceeded();
      try {
        const t_ai0 = Date.now();
        const vision = await extractInvoiceImageWithGeminiVision(
          optimized.buffer.toString('base64'), optimized.mimeType, file.name
        );
        console.log(`[Parse Perf] Vision AI Call: ${Date.now() - t_ai0}ms`);
        rawData = (vision.data || {}) as Record<string, unknown>;
        documentType = vision.documentType;
        sourceReadFields = Object.keys(rawData);
        usedVision = true;
        visionMeta = { droppedKeys: vision.droppedKeys, provenance: vision.provenance };
      } catch (aiError: any) {
        console.error('[Document Parse] Lỗi bóc tách ảnh hóa đơn qua ShopAIKey Gemini Vision:', aiError);
        return NextResponse.json({
          error: `Lỗi đọc ảnh hóa đơn từ ShopAIKey (${SHOPAIKEY_GEMINI_API_CONFIG.MODEL}): ${aiError?.message || 'Không thể trích xuất dữ liệu từ API'}`
        }, { status: 502 });
      }
    }

    if (documentType === 'NOT_INVOICE' || (documentType === 'UNCERTAIN' && Object.keys(rawData).length === 0)) {
      const result = DocumentExtractionSchema.parse({
        invoice: {}, confidence: {}, needsReview: true, sourceType, artifactId, sourceHash,
        documentType, warnings: [], uncertainFields: [], absentFields: [], fieldEvidence: {}
      });
      getDatabase().prepare('INSERT OR REPLACE INTO extraction_reviews (artifact_id,payload_json) VALUES (?,?)')
        .run(artifactId, JSON.stringify({ ...result, extractionVersion, cachedResult: result }));
      return extractionResponse(result, started);
    }

    const t_san0 = Date.now();
    const { invoice, warnings } = sanitizeInvoice(rawData);
    console.log(`[Parse Perf] Sanitize Invoice: ${Date.now() - t_san0}ms`);
    const { identity: supplierIdentity, trustedDerivedFields: trustedFieldsArray } = await verifySupplierIdentity(invoice as Record<string, unknown>);
    const trustedDerivedFields = new Set(trustedFieldsArray);

    const supplierReview = supplierIdentityReview(
      supplierIdentity,
      sourceType === 'XML' ? 'XML' : sourceType === 'PDF' && sourceReadFields ? 'PDF_TEXT' : sourceType === 'IMAGE' ? 'VLM' : 'USER'
    );
    const uncertainFields: string[] = [...supplierReview.uncertainFields];
    const fieldWarnings: Record<string, string> = { ...supplierReview.fieldWarnings };
    const ocrHighlights: Array<{ text: string; confidence: number; bbox?: { x: number; y: number; w: number; h: number }; field?: string; reason?: string }> = [];

    const inferredFields = Object.keys(invoice).filter(key => !trustedDerivedFields.has(key) && !['isImageBlurry','isAdjustment','sellerStatus'].includes(key) && (rawData[key] === undefined || rawData[key] === null || (sourceReadFields !== undefined && !sourceReadFields.includes(key))));
    for (const key of inferredFields) if (!uncertainFields.includes(key)) uncertainFields.push(key);
    // Zero amounts and absent identities are not evidence of a successful extraction.
    const requiredSourceFields = ['invoiceNumber','invoiceDate','supplierTaxCode','supplierName','itemName','preTaxAmount','taxRate','taxAmount','totalAmount'];
    if (sourceType !== 'XML') requiredSourceFields.push('buyerTaxCode');
    for (const key of requiredSourceFields) {
      if (invoice[key] === undefined || invoice[key] === null || invoice[key] === '') {
        if (!uncertainFields.includes(key)) uncertainFields.push(key);
        fieldWarnings[key] = 'Chưa đọc được từ chứng từ gốc; cần bổ sung và xác minh.';
      }
    }
    // AI chưa chắc tài liệu là hóa đơn nhưng vẫn trả dữ liệu: không trường nào được coi là đã xác minh.
    if (documentType === 'UNCERTAIN') {
      for (const key of requiredSourceFields) {
        if (!uncertainFields.includes(key)) uncertainFields.push(key);
        fieldWarnings[key] ??= 'AI chưa chắc tài liệu là hóa đơn; cần xác minh trường này với chứng từ gốc.';
      }
    }
    const absentFields = requiredSourceFields.filter((key) => invoice[key] === undefined || invoice[key] === null || invoice[key] === '');
    // A valid-looking code alone is not identity proof; retain it for review
    // unless the source document and official grounding agree.
    for (const key of ['supplierTaxCode', 'buyerTaxCode'] as const) {
      const value = invoice[key];
      if (typeof value === 'string' && value && !validateTaxCode(value).isValid) {
        if (!uncertainFields.includes(key)) uncertainFields.push(key);
        fieldWarnings[key] = 'Mã số thuế đọc được không vượt qua kiểm tra chữ số; cần đối chiếu bản gốc.';
      }
    }
    if (sourceType !== 'XML' && Number(invoice.preTaxAmount || 0) === 0 && Number(invoice.totalAmount || 0) === 0) {
      for (const key of ['preTaxAmount','taxAmount','totalAmount']) {
        if (!uncertainFields.includes(key)) uncertainFields.push(key);
        fieldWarnings[key] = 'Không có số tiền đáng tin cậy từ ảnh; số 0 cần xác minh.';
      }
    }
    // Run the arithmetic check only after source/uncertainty guards have been
    // assembled. A mathematically balanced value from a weak OCR token is not
    // evidence that the printed invoice is correct.
    const mathCheck = validateInvoiceMathematics(invoice, {
      untrustedFields: uncertainFields,
      sourceType
    });
    const combinedWarnings = [...initialWarnings, ...warnings, ...mathCheck.notes];

    const confidence = Object.fromEntries(
      Object.keys(invoice).map((key) => [
        key,
        trustedDerivedFields.has(key)
          ? 1
          : uncertainFields.includes(key)
          ? 0.6
          : sourceType === 'XML'
          ? 1
          : Math.min(0.95, Math.max(0.05, 0.85))
      ])
    );
    const evidenceSource = sourceType === 'XML'
      ? 'XML'
      : sourceType === 'PDF' && sourceReadFields && !usedVision
      ? 'PDF_TEXT'
      : sourceType === 'IMAGE' || usedVision
      ? 'VLM'
      : 'USER';
    const fieldEvidence = Object.fromEntries(
      Object.keys(invoice).map((key) => [key, {
        source: trustedDerivedFields.has(key) ? 'OFFICIAL_REGISTRY' : inferredFields.includes(key) ? 'INFERRED' : evidenceSource,
        status: trustedDerivedFields.has(key)
          ? 'VERIFIED'
          : !mathCheck.isBalanced && ['preTaxAmount', 'taxAmount', 'totalAmount'].includes(key)
          ? 'CONFLICT'
          : uncertainFields.includes(key)
          ? 'UNCERTAIN'
          : 'VERIFIED',
        confidence: confidence[key] ?? 0,
        text: trustedDerivedFields.has(key) ? String(invoice[key] ?? '') : typeof rawData[key] === 'string' ? rawData[key] as string : undefined
      }])
    );
    Object.assign(fieldEvidence, supplierReview.fieldEvidence);
    for (const key of absentFields) {
      fieldEvidence[key] = {
        source: evidenceSource,
        status: 'ABSENT',
        confidence: 0,
        text: undefined
      };
    }
    const conflicts = [
      ...supplierReview.conflicts,
      ...(mathCheck.isBalanced ? [] : combinedWarnings.filter((warning) => /không khớp|không xác nhận|mâu thuẫn/i.test(warning)))
    ];

    const result = DocumentExtractionSchema.parse({
      invoice,
      confidence,
      needsReview: !mathCheck.isBalanced || Boolean(invoice.isImageBlurry) || uncertainFields.length > 0 || Boolean(supplierIdentity && supplierIdentity.status !== 'VERIFIED'),
      sourceType,
      artifactId,
      sourceHash,
      documentType,
      supplierIdentity,
      warnings: combinedWarnings,
      uncertainFields,
      absentFields,
      conflicts,
      fieldWarnings,
      fieldEvidence,
      ocrHighlights
    });

    getDatabase().prepare('INSERT OR REPLACE INTO extraction_reviews (artifact_id,payload_json) VALUES (?,?)').run(artifactId,JSON.stringify({...result, invoice:rawData, inferredFields, extractionVersion, llmProvenance:visionMeta?.provenance ?? null, droppedKeys:visionMeta?.droppedKeys ?? [], cachedResult:result}));
    return extractionResponse(result,started);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Không thể đọc chứng từ' }, { status: error instanceof Error && error.message === 'AUTH_REQUIRED' ? 401 : error instanceof ArtifactQuotaError ? 413 : 400 });
  }
}

export async function POST(...args: Parameters<typeof handlePOST>) { return withRequestDatabase(args[0], () => handlePOST(...args)); }

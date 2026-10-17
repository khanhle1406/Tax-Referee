'use client';

import React, { useRef, useState, useEffect, useLayoutEffect, useCallback } from 'react';
import { Loader2, Eye, RotateCcw, ShieldCheck, FileCheck2 } from 'lucide-react';
import { DocumentExtraction, DocumentExtractionSchema, InvoiceInput, RefereeDecision, SystemPolicyConfig, OcrHighlight, FieldEvidence, SupplierIdentity } from '@/lib/schemas';
import { normalizeTaxCodeFormat, validateTaxCode } from '@/lib/taxCode';
import { formatVND, formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { CapturePhoneDialog } from '@/components/CapturePhoneDialog';
import { toast } from 'sonner';
import { InvoiceImageViewer } from '@/components/InvoiceImageViewer';
import { ReceptionUpload } from '@/components/reception/ReceptionUpload';
import { ReceptionSubmitBar } from '@/components/reception/ReceptionSubmitBar';
import { ReceptionLayout } from '@/components/reception/ReceptionLayout';
import { requiredDecisionFields } from '@/lib/refereeRequirements';
import { DOCUMENT_BATCH_LIMIT, documentFileError, runDocumentBatch } from '@/lib/documentBatch';
import { ReceptionBatchQueue, type ReceptionBatchItem } from '@/components/reception/ReceptionBatchQueue';
import {isNeutralDemoSupplierField} from '@/lib/demoSupplierPresentation';

function hasDetectedInvoice(invoice: Partial<InvoiceInput> | null | undefined): boolean {
  if (!invoice) return false;
  const hasIdentity = [invoice.invoiceNumber, invoice.supplierName, invoice.supplierTaxCode, invoice.itemName]
    .some((value) => typeof value === 'string' && value.trim().length > 0);
  const hasAmount = [invoice.preTaxAmount, invoice.taxAmount, invoice.totalAmount]
    .some((value) => typeof value === 'number' && Number.isFinite(value) && value > 0);
  return hasIdentity || hasAmount;
}

function emptyInvoiceInput(source?: Pick<InvoiceInput, 'sourceArtifactId' | 'sourceHash'>): InvoiceInput {
  return {
    id: `INV-${Date.now()}`,
    invoiceNumber: '', invoiceDate: '', supplierTaxCode: '', supplierName: '', itemName: '',
    preTaxAmount: 0, taxRate: undefined as unknown as InvoiceInput['taxRate'], taxAmount: 0, totalAmount: 0,
    paymentMethod: undefined, hasBankSlip: undefined, hasItemManifest: undefined, sellerStatus: 'UNKNOWN',
    isImageBlurry: false, isAdjustment: false, isStaffReimbursed: false,
    ...source
  };
}

function notifyExtractionQuality(data: DocumentExtraction): boolean {
  const reviewFields = new Set([
    ...Object.entries(data.fieldEvidence || {}).filter(([, evidence]) => evidence.status !== 'VERIFIED').map(([field]) => field),
    ...(data.uncertainFields || []),
    ...(data.absentFields || []),
    ...(data.conflicts || []),
    ...Object.keys(data.fieldWarnings || {})
  ]);
  const identity = data.supplierIdentity;
  if (data.documentType === 'UNCERTAIN') {
    toast.warning('Ảnh chưa rõ có phải hóa đơn; hãy kiểm tra lại chứng từ.');
  } else if (identity?.status === 'DEMO_MATCH') {
    toast.info('Đã điền thông tin nhà cung cấp.');
  } else if (identity && identity.status !== 'VERIFIED') {
    const message = identity.status === 'CONFLICT'
      ? 'MST trên hóa đơn chưa khớp tên nhà cung cấp; đã giữ nguyên để kiểm tra.'
      : identity.status === 'AMBIGUOUS'
      ? 'Có nhiều nhà cung cấp phù hợp; chưa tự điền tên hoặc MST.'
      : identity.status === 'SOURCE_UNAVAILABLE'
      ? 'Chưa truy cập được nguồn tra cứu; giữ nguyên dữ liệu đã đọc.'
      : 'Chưa xác minh được nhà cung cấp từ nguồn chính thống.';
    toast.warning(message);
  } else if (reviewFields.size > 0) {
    toast.warning(`Có ${reviewFields.size} mục cần đối chiếu.`);
  }
  return reviewFields.size > 0;
}

interface InteractiveInputFormProps {
  onDirtyChange?: (dirty:boolean)=>void;
  onEvaluateResult: (decision: RefereeDecision, invoice: InvoiceInput, options?: {stayOnReceive: boolean}) => void;
  dynamicConfig?: Partial<SystemPolicyConfig>;
  demoMode?: boolean;
}

interface ReceptionResult {status: 'ROUTINE' | 'ESCALATED'; message: string; approvedTax?: number; riskGroup?: string; held?: boolean}
interface ReceptionDraft {
  formData: InvoiceInput; documentWarnings: string[]; uncertainFields: string[];
  fieldWarnings: Record<string, string>; fieldEvidence: Record<string, FieldEvidence>;
  supplierIdentity?: SupplierIdentity; ocrHighlights: OcrHighlight[]; evaluationRevision?: number;
  lastResult: ReceptionResult | null; lastEngine: string | null; savedFingerprint: string | null;
}
interface BatchJob extends ReceptionBatchItem {result?: DocumentExtraction}

export const InteractiveInputForm: React.FC<InteractiveInputFormProps> = ({
  onEvaluateResult,
  dynamicConfig,
  demoMode = false,
  onDirtyChange
}) => {
  const [inputMode, setInputMode] = useState<'FILE' | 'PASTE'>('FILE');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pastedText, setPastedText] = useState<string>('');
  const [captureDialogOpen, setCaptureDialogOpen] = useState(false);
  const [batchJobs, setBatchJobs] = useState<BatchJob[]>([]);
  const batchJobsRef = useRef<BatchJob[]>([]);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const activeBatchIdRef = useRef<string | null>(null);
  const batchDraftsRef = useRef(new Map<string, ReceptionDraft>());
  const batchAbortRef = useRef<AbortController | null>(null);
  const batchGenerationRef = useRef(0);
  useEffect(() => () => {batchGenerationRef.current++; batchAbortRef.current?.abort();}, []);

  // Trạng thái xem trước chứng từ gốc (Left Column Preview)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFileType, setPreviewFileType] = useState<'XML' | 'PDF' | 'IMAGE' | null>(null);
  const [xmlContent, setXmlContent] = useState<string | null>(null);
  const [xmlViewTab, setXmlViewTab] = useState<'VISUAL' | 'RAW'>('VISUAL');

  const [formData, setFormData] = useState<InvoiceInput>(() => {
    return {
      id: `INV-${Date.now()}`,
      invoiceNumber: '',
      invoiceDate: '',
      supplierTaxCode: '',
      supplierName: '',
      itemName: '',
      preTaxAmount: 0,
      taxRate: undefined as unknown as InvoiceInput['taxRate'],
      taxAmount: 0,
      totalAmount: 0,
      paymentMethod: undefined,
      hasBankSlip: undefined,
      hasItemManifest: undefined,
      sellerStatus: 'UNKNOWN',
      isImageBlurry: false,
      isAdjustment: false,
      isStaffReimbursed: false
    };
  });

  const [isEvaluating, setIsEvaluating] = useState(false);
  const evaluationLockRef = useRef(false);
  const [lastEngine, setLastEngine] = useState<string | null>(null);
  const [isParsingDocument, setIsParsingDocument] = useState(false);
  const parseRequestIdRef = useRef(0);
  const captureArtifactRef=useRef<string|null>(null);
  const savedFingerprintRef=useRef<string|null>(null);
  const extractionStartRef = useRef<{requestId:number;started:number;complete:boolean;cacheHit:boolean}|null>(null);
  const [extractionTiming,setExtractionTiming] = useState<{elapsedMs:number;cacheHit:boolean}|null>(null);
  useLayoutEffect(() => {
    const measurement=extractionStartRef.current;
    if (isParsingDocument || !measurement?.complete) return;
    // Two frames: the form commit has painted before reporting end-to-end time.
    let second=0;
    const first=requestAnimationFrame(()=>{ second=requestAnimationFrame(()=>{
      if (measurement.requestId !== parseRequestIdRef.current) return;
      setExtractionTiming({elapsedMs:Math.round(performance.now()-measurement.started),cacheHit:measurement.cacheHit});
      extractionStartRef.current=null;
    }); });
    return ()=>{cancelAnimationFrame(first);cancelAnimationFrame(second);};
  },[isParsingDocument]);

  const parseAbortRef = useRef<AbortController | null>(null);
  const [documentWarnings, setDocumentWarnings] = useState<string[]>([]);
  const [uncertainFields, setUncertainFields] = useState<string[]>([]);
  const [fieldWarnings, setFieldWarnings] = useState<Record<string, string>>({});
  const [fieldEvidence, setFieldEvidence] = useState<Record<string, FieldEvidence>>({});
  const [supplierIdentity, setSupplierIdentity] = useState<SupplierIdentity | undefined>(undefined);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [ocrHighlights, setOcrHighlights] = useState<OcrHighlight[]>([]);
  const [showOcrHighlights, setShowOcrHighlights] = useState<boolean>(true);
  const [evaluationRevision, setEvaluationRevision] = useState<number | undefined>(undefined);
  const [lastResult, setLastResult] = useState<ReceptionResult | null>(null);
  const currentDraftRef = useRef<ReceptionDraft | null>(null);
  currentDraftRef.current = {formData, documentWarnings, uncertainFields, fieldWarnings, fieldEvidence,
    supplierIdentity, ocrHighlights, evaluationRevision, lastResult, lastEngine, savedFingerprint: savedFingerprintRef.current};

  const fingerprint=JSON.stringify(formData);
  const hasDraft=Boolean(previewUrl||pastedText||formData.invoiceNumber||formData.invoiceDate||formData.supplierName||formData.supplierTaxCode||formData.itemName||formData.totalAmount||formData.paymentMethod||formData.taxRate!==undefined);
  const dirty=isParsingDocument||isEvaluating||batchJobs.some(job=>job.status==='QUEUED'||job.status==='PROCESSING'||(job.status==='READY'&&!job.evaluated))||(hasDraft&&fingerprint!==savedFingerprintRef.current);
  useEffect(()=>{onDirtyChange?.(dirty);},[dirty,onDirtyChange]);
  useEffect(()=>{if(!dirty)return;const leaving=(event:BeforeUnloadEvent):void=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',leaving);return ()=>window.removeEventListener('beforeunload',leaving);},[dirty]);
  useEffect(()=>{const field=Object.keys(formErrors)[0];if(field)document.getElementById(field)?.focus();},[formErrors]);
  const requiredFields=requiredDecisionFields(formData,dynamicConfig);
  const supplementalFields = ['sellerStatus', 'hasBankSlip', 'hasItemManifest'] as const;
  const demoSupplierPairMatches = supplierIdentity?.status === 'DEMO_MATCH'
    && supplierIdentity.legalName === formData.supplierName
    && normalizeTaxCodeFormat(supplierIdentity.supplierTaxCode || '') === normalizeTaxCodeFormat(formData.supplierTaxCode || '')
    && validateTaxCode(formData.supplierTaxCode || '').isValid;
  const neutralSupplierField = (field: string): boolean => Boolean(demoSupplierPairMatches
    && isNeutralDemoSupplierField(field, supplierIdentity, fieldWarnings[field], fieldEvidence[field]));
  const showSupplement = formData.isAdjustment || formData.isStaffReimbursed
    || formData.sellerStatus === 'SUSPENDED' || formData.sellerStatus === 'CLOSED'
    || supplementalFields.some(field => uncertainFields.includes(field) || formErrors[field] || fieldWarnings[field]
      || (requiredFields.has(field) && (formData[field] === undefined || formData[field] === 'UNKNOWN' || formData[field] === false)));

  const applyCaptureExtraction = useCallback((data: DocumentExtraction): boolean => {
    if(data.artifactId!==captureArtifactRef.current)return false;
    const extracted = Object.fromEntries(
      Object.entries(data.invoice || {}).filter(([, value]) => value !== undefined && value !== null && value !== '')
    );
    if (!hasDetectedInvoice(data.invoice)) {
      if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(data.artifactId ? `/api/documents/artifacts/${encodeURIComponent(data.artifactId)}` : null);
      setPreviewFileType('IMAGE');
      setUploadedFile(null);
      setXmlContent(null);
      setDocumentWarnings([]);
      setFieldEvidence({});
      setSupplierIdentity(undefined);
      setFieldWarnings({});
      setUncertainFields([]);
      setOcrHighlights([]);
      setEvaluationRevision(undefined);
      setLastResult(null);
      setFormData(emptyInvoiceInput({ sourceArtifactId: data.artifactId, sourceHash: data.sourceHash }));
      toast.error('AI chưa nhận diện được hóa đơn trong ảnh. Hãy chụp rõ hơn hoặc nhập thủ công.');
      return false;
    }
    if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(data.artifactId ? `/api/documents/artifacts/${encodeURIComponent(data.artifactId)}` : null);
    setPreviewFileType('IMAGE');
    setUploadedFile(null);
    setXmlContent(null);
    setEvaluationRevision(undefined);
    setFormData(() => ({
      invoiceNumber: '', invoiceDate: '', supplierTaxCode: '', supplierName: '', itemName: '', preTaxAmount: 0,
      taxRate: undefined as unknown as InvoiceInput['taxRate'], taxAmount: 0, totalAmount: 0,
      paymentMethod: undefined, hasBankSlip: undefined, hasItemManifest: undefined, sellerStatus: 'UNKNOWN',
      isImageBlurry: false, isAdjustment: false, ...extracted,
      sourceArtifactId: data.artifactId, sourceHash: data.sourceHash, id: `DOC-${Date.now()}`
    } as InvoiceInput));
    setDocumentWarnings(data.warnings || []);
    setUncertainFields(data.uncertainFields || []);
    setFieldWarnings(data.fieldWarnings || {});
    setFieldEvidence(data.fieldEvidence || {});
    setSupplierIdentity(data.supplierIdentity);
    setOcrHighlights(data.ocrHighlights || []);
    setLastResult(null);
    return !notifyExtractionQuality(data);
  }, [previewUrl]);

  const startCaptureProcessing = useCallback((artifactId: string) => {
    captureArtifactRef.current=artifactId;
    parseRequestIdRef.current += 1;
    parseAbortRef.current?.abort();
    setDocumentWarnings([]);
    setFieldEvidence({});
    setSupplierIdentity(undefined);
    setFieldWarnings({});
    setUncertainFields([]);
    setOcrHighlights([]);
    setFormErrors({});
    setEvaluationRevision(undefined);
    setLastResult(null);
    setUploadedFile(null);
    setXmlContent(null);
    setPreviewUrl(`/api/documents/artifacts/${encodeURIComponent(artifactId)}`);
    setPreviewFileType('IMAGE');
    setFormData(emptyInvoiceInput({ sourceArtifactId: artifactId }));
    setIsParsingDocument(true);
  }, []);

  const finishCaptureProcessing = useCallback(() => {if(captureArtifactRef.current)setIsParsingDocument(false);}, []);

  // Trạng thái tra cứu tự động 2 chiều (MST <-> Tên Nhà Cung Cấp)
  const [taxLookupLoading, setTaxLookupLoading] = useState<boolean>(false);
  const autoLookupAbortRef = useRef<AbortController | null>(null);
  const supplierIdentityUserEditedRef = useRef(false);

  // Chiều 1: Tự động tra Tên & Địa chỉ từ MST doanh nghiệp hoặc mã 12 số của hộ kinh doanh
  useEffect(() => {
    const rawMst = (formData.supplierTaxCode || '').trim();
    const cleanMst = normalizeTaxCodeFormat(rawMst);

    if (cleanMst && (!formData.supplierName || formData.supplierName.trim().length === 0)) {
      if (autoLookupAbortRef.current) autoLookupAbortRef.current.abort();
      const controller = new AbortController();
      autoLookupAbortRef.current = controller;

      setTaxLookupLoading(true);
      const timer = setTimeout(async () => {
        try {
          const res = await fetch(`/api/suppliers/lookup?taxCode=${encodeURIComponent(cleanMst)}`, {
            signal: controller.signal
          });
          if (res.ok) {
            const data = await res.json();
            if (controller.signal.aborted) return;
            if (data?.found && (data?.data?.isVerified || data?.data?.isDemo) && data?.data?.legalName) {
              if (data.supplierIdentity) setSupplierIdentity(data.supplierIdentity);
              supplierIdentityUserEditedRef.current = false;
              setFormData((prev) => ({
                ...prev,
                supplierName: normalizeTaxCodeFormat(prev.supplierTaxCode || '') === cleanMst && !prev.supplierName?.trim() ? data.data.legalName : prev.supplierName
              }));
              if (data.data.isDemo) setUncertainFields(previous => [...new Set([...previous, 'supplierName', 'supplierTaxCode'])]);
              if (data.data.isDemo) toast.info('Đã điền từ danh mục demo.');
              else toast.success('Đã đối chiếu tên nhà cung cấp theo MST.');
            }
          }
        } catch (err: any) {
          if (err?.name !== 'AbortError') console.warn('Auto lookup MST error:', err);
        } finally {
          if (!controller.signal.aborted) setTaxLookupLoading(false);
        }
      }, 400);

      return () => {
        clearTimeout(timer);
        controller.abort();
      };
    }
  }, [formData.supplierTaxCode, formData.supplierName, activeBatchId]);

  // Chiều 2: Tự tra MST nếu thiếu/sai định dạng; sau khi người dùng sửa tên,
  // đối chiếu lại cả cặp tên-MST để tự sửa lỗi OCR có đủ bằng chứng.
  useEffect(() => {
    const name = (formData.supplierName || '').trim();
    const mst = (formData.supplierTaxCode || '').trim();
    const address = (formData.supplierAddress || '').trim();
    const validTaxCode = Boolean(mst && validateTaxCode(mst).isValid);
    const reconcileEditedPair = Boolean(mst && supplierIdentityUserEditedRef.current);

    if (name.length >= 3 && (!validTaxCode || reconcileEditedPair)) {
      if (autoLookupAbortRef.current) autoLookupAbortRef.current.abort();
      const controller = new AbortController();
      autoLookupAbortRef.current = controller;

      const timer = setTimeout(async () => {
        try {
          setTaxLookupLoading(true);
          const search = new URLSearchParams({ name });
          if (address) search.set('address', address);
          if (mst) search.set('taxCode', mst);
          const res = await fetch(`/api/suppliers/lookup?${search.toString()}`, {
            signal: controller.signal
          });
          if (res.ok) {
            const data = await res.json();
            if (controller.signal.aborted) return;
            if (data?.supplierIdentity) setSupplierIdentity(data.supplierIdentity);
            if (data?.found && data?.data?.taxCode && (data?.data?.isVerified || data?.data?.isDemo)) {
              const resolvedTaxCode = String(data.data.taxCode);
              const resolvedName = String(data.data.supplierName || data.data.legalName || name);
              const identityChanged = resolvedTaxCode !== mst || resolvedName !== name;
              supplierIdentityUserEditedRef.current = false;
              if (data.data.isDemo) setUncertainFields(previous => [...new Set([...previous, 'supplierName', 'supplierTaxCode'])]);
              if (identityChanged) {
                setFormData((prev) => {
                  if (prev.supplierName?.trim() !== name
                    || prev.supplierTaxCode?.trim() !== mst
                    || (prev.supplierAddress || '').trim() !== address) return prev;
                  return {
                    ...prev,
                    supplierTaxCode: resolvedTaxCode,
                    supplierName: resolvedName
                  };
                });
                if (data.data.isDemo) toast.info('Đã điền từ danh mục demo.');
                else toast.success(mst ? 'Đã tự đối chiếu tên và MST.' : 'Đã tự điền MST nhà cung cấp.');
              }
            } else if (data?.lookupStatus === 'CONFLICT') {
              supplierIdentityUserEditedRef.current = false;
              toast.warning('Tên và MST chưa khớp; giữ nguyên để kiểm tra.');
            } else {
              supplierIdentityUserEditedRef.current = false;
              toast.warning(data?.lookupStatus === 'NOT_CONFIGURED'
                ? 'Tra cứu MST theo tên chưa được cấu hình.'
                : reconcileEditedPair
                ? 'Chưa xác minh được cặp tên và MST; dữ liệu được giữ nguyên.'
                : 'Chưa đối chiếu được MST theo tên này; dữ liệu được giữ nguyên.');
            }
          }
        } catch (err: any) {
          if (err?.name !== 'AbortError') console.warn('Auto lookup Name error:', err);
        } finally {
          if (!controller.signal.aborted) setTaxLookupLoading(false);
        }
      }, 700);

      return () => {
        clearTimeout(timer);
        controller.abort();
      };
    }
  }, [formData.supplierName, formData.supplierTaxCode, formData.supplierAddress, activeBatchId]);

  // Kiểm tra xem đã có hóa đơn/file nạp vào chưa
  const hasDocument = Boolean(
    uploadedFile || previewUrl || xmlContent || (inputMode === 'PASTE' && pastedText.trim() && (formData.invoiceNumber || formData.supplierName))
  );

  // Dọn dẹp object URL khi unmount
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  // Reset và điều khiển Zoom & Pan
  /**
   * Tối ưu hóa & nén ảnh ngay tại trình duyệt trước khi upload (giảm dung lượng 80-90%, tăng tốc bóc tách gấp 5 lần)
   */
  const compressImageClientSide = async (file: File): Promise<File> => {
    const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(file.name);
    if (!isImage) {
      return file;
    }
    // Nếu file ảnh <= 2MB thì upload trực tiếp ngay lập tức (<1ms), không tốn thời gian chạy Canvas giải nén trên trình duyệt
    if (file.size <= 2 * 1024 * 1024) {
      return file;
    }
    return new Promise((resolve) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const MAX_DIM = 1800; // Giữ độ phân giải sắc nét cao để AI đọc chính xác số tiền, mã số thuế và dòng hàng
        let width = img.width;
        let height = img.height;

        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob || (blob.size >= file.size && width === img.width)) {
              resolve(file);
            } else {
              const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, '.jpg'), {
                type: 'image/jpeg',
                lastModified: Date.now()
              });
              resolve(compressedFile);
            }
          },
          'image/jpeg',
          0.88
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(file);
      };
      img.src = objectUrl;
    });
  };

  const handleDocumentUpload = async (file: File) => {
    const fileError = documentFileError(file);
    if (fileError) {toast.error(fileError); return;}
    const fileNameLower = file.name.toLowerCase();
    const supported = file.type === 'application/pdf' || file.type.includes('xml')
      || ['image/png', 'image/jpeg', 'image/webp'].includes(file.type)
      || /\.(xml|pdf|png|jpe?g|webp)$/i.test(file.name);
    if (!supported) {
      const message = 'Định dạng chưa được hỗ trợ. Hãy chọn file XML, PDF, PNG, JPG hoặc WEBP.';
      toast.error(message);
      return;
    }

    parseAbortRef.current?.abort();
    captureArtifactRef.current=null;
    const requestId = ++parseRequestIdRef.current;
    extractionStartRef.current={requestId,started:performance.now(),complete:false,cacheHit:false};
    setExtractionTiming(null);
    const controller = new AbortController();
    parseAbortRef.current = controller;
    setIsParsingDocument(true);
    setDocumentWarnings([]);
    setFormErrors({});
    setUploadedFile(file);

    // Xác định định dạng để preview
    if (file.type.startsWith('image/') || fileNameLower.endsWith('.png') || fileNameLower.endsWith('.jpg') || fileNameLower.endsWith('.jpeg') || fileNameLower.endsWith('.webp')) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(file));
      setPreviewFileType('IMAGE');
      setXmlContent(null);
    } else if (file.type === 'application/pdf' || fileNameLower.endsWith('.pdf')) {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(file));
      setPreviewFileType('PDF');
      setXmlContent(null);
    } else if (file.type.includes('xml') || fileNameLower.endsWith('.xml')) {
      setPreviewFileType('XML');
      setPreviewUrl(null);
      file.text().then((txt) => setXmlContent(txt)).catch(() => {});
    } else {
      setPreviewFileType(null);
    }

    try {
      // Tự động nén ảnh trước khi upload nếu file lớn
      let fileToUpload = file;
      if (file.type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(file.name)) {
        fileToUpload = await compressImageClientSide(file);
      }
      if (requestId !== parseRequestIdRef.current) return;

      const form = new FormData();
      form.append('file', fileToUpload);
      const response = await fetch('/api/documents/parse', { method: 'POST', body: form, signal: controller.signal });
      const data = await response.json();
      if (requestId !== parseRequestIdRef.current) return;
      if (!response.ok) throw new Error(data.error || 'Lỗi đọc chứng từ');
      const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(file.name);
      if (data.documentType === 'NOT_INVOICE' || ((isImage || data.sourceType === 'PDF') && !hasDetectedInvoice(data.invoice))) {
        setDocumentWarnings([]);
        setFieldEvidence({});
        setSupplierIdentity(undefined);
        setFieldWarnings({});
        setUncertainFields([]);
        setOcrHighlights([]);
        setEvaluationRevision(undefined);
        setLastResult(null);
        setFormData(emptyInvoiceInput({ sourceArtifactId: data.artifactId, sourceHash: data.sourceHash }));
        toast.error('AI chưa nhận diện được hóa đơn trong ảnh. Hãy chụp rõ hơn hoặc nhập thủ công.');
        return;
      }
      extractionStartRef.current={requestId,started:extractionStartRef.current!.started,complete:true,cacheHit:Boolean(data.performance?.cacheHit)};
      const extracted = Object.fromEntries(
        Object.entries(data.invoice || {}).filter(([, value]) => value !== undefined && value !== null && value !== '')
      );
      setEvaluationRevision(undefined);
      setFormData(() => ({
        invoiceNumber:'',invoiceDate:'',supplierTaxCode:'',supplierName:'',itemName:'',preTaxAmount:0,taxRate:undefined as unknown as InvoiceInput['taxRate'],taxAmount:0,totalAmount:0,paymentMethod:undefined,hasBankSlip:undefined,hasItemManifest:undefined,sellerStatus:'UNKNOWN',isImageBlurry:false,isAdjustment:false,
        ...extracted,
        sourceArtifactId: data.artifactId,
        sourceHash: data.sourceHash,
        id: `DOC-${Date.now()}`
      } as InvoiceInput));
      setDocumentWarnings(data.warnings || []);
      setUncertainFields(data.uncertainFields || []);
      setFieldWarnings(data.fieldWarnings || {});
      setFieldEvidence(data.fieldEvidence || {});
      setSupplierIdentity(data.supplierIdentity);
      setOcrHighlights(data.ocrHighlights || []);
      setLastResult(null);
      notifyExtractionQuality(data);
    } catch (error) {
      if (requestId !== parseRequestIdRef.current || (error instanceof Error && error.name === 'AbortError')) return;
      const msg = error instanceof Error ? error.message : 'Không thể đọc file';
      toast.error(msg.length<=100?msg:'Không đọc được chứng từ. Hãy thử lại.');
    } finally {
      if (requestId === parseRequestIdRef.current) setIsParsingDocument(false);
    }
  };

  const showBatchJob = (job: BatchJob): void => {
    parseAbortRef.current?.abort();
    autoLookupAbortRef.current?.abort();
    captureArtifactRef.current = null;
    const requestId = ++parseRequestIdRef.current;
    setActiveBatchId(job.id); activeBatchIdRef.current = job.id;
    setUploadedFile(job.file); setExtractionTiming(null); extractionStartRef.current = null;
    setPreviewUrl(null); setXmlContent(null); setPastedText('');
    const isXml = /\.xml$/i.test(job.file.name);
    setPreviewFileType(isXml ? 'XML' : /\.pdf$/i.test(job.file.name) ? 'PDF' : 'IMAGE');
    if (isXml) void job.file.text().then(text => {if (requestId === parseRequestIdRef.current) setXmlContent(text);})
      .catch(() => {if (requestId === parseRequestIdRef.current) toast.error('Không mở được bản xem trước XML.');});
    else setPreviewUrl(URL.createObjectURL(job.file));
    const data = job.result;
    const draft = batchDraftsRef.current.get(job.id);
    setFormData(draft?.formData || {...emptyInvoiceInput(), ...data?.invoice, id: job.id,
      sourceArtifactId: data?.artifactId, sourceHash: data?.sourceHash});
    setDocumentWarnings(draft?.documentWarnings || data?.warnings || []);
    setUncertainFields(draft?.uncertainFields || data?.uncertainFields || []);
    setFieldWarnings(draft?.fieldWarnings || data?.fieldWarnings || {});
    setFieldEvidence(draft?.fieldEvidence || data?.fieldEvidence || {});
    setSupplierIdentity(draft ? draft.supplierIdentity : data?.supplierIdentity);
    setOcrHighlights(draft?.ocrHighlights || data?.ocrHighlights || []);
    setEvaluationRevision(draft?.evaluationRevision); setLastResult(draft?.lastResult || null);
    setLastEngine(draft?.lastEngine || null); savedFingerprintRef.current = draft?.savedFingerprint || null;
    supplierIdentityUserEditedRef.current = false;
    setFormErrors({}); setTaxLookupLoading(false);
    setIsParsingDocument(job.status === 'QUEUED' || job.status === 'PROCESSING');
  };

  const selectBatchJob = (id: string): void => {
    if (isEvaluating || id === activeBatchIdRef.current) return;
    const job = batchJobsRef.current.find(item => item.id === id);
    if (!job) return;
    if (activeBatchIdRef.current && currentDraftRef.current && batchJobsRef.current.find(item => item.id === activeBatchIdRef.current)?.status === 'READY') {
      batchDraftsRef.current.set(activeBatchIdRef.current, currentDraftRef.current);
    }
    showBatchJob(job);
    if (job.error) toast.error(job.error);
  };

  const runBatch = async (jobs: BatchJob[]): Promise<void> => {
    const controller = new AbortController();
    batchAbortRef.current = controller;
    const generation = ++batchGenerationRef.current;
    const update = (id: string, changes: Partial<BatchJob>): void => {
      if (generation !== batchGenerationRef.current) return;
      batchJobsRef.current = batchJobsRef.current.map(job => job.id === id ? {...job, ...changes} : job);
      setBatchJobs(batchJobsRef.current);
      const job = batchJobsRef.current.find(item => item.id === id)!;
      if (activeBatchIdRef.current === id) showBatchJob(job);
      if (activeBatchIdRef.current === id && changes.error) toast.error(changes.error);
    };
    await runDocumentBatch(jobs, {
      signal: controller.signal,
      started: job => update(job.id, {status: 'PROCESSING', error: undefined}),
      process: async (job, signal) => {
        const fileError = documentFileError(job.file);
        if (fileError) throw new Error(fileError);
        const file = await compressImageClientSide(job.file);
        signal.throwIfAborted();
        const form = new FormData(); form.append('file', file);
        const response = await fetch('/api/documents/parse', {method: 'POST', body: form, signal});
        const payload = await response.json();
        if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : 'Không đọc được chứng từ.');
        const result = DocumentExtractionSchema.parse(payload);
        if (result.documentType === 'NOT_INVOICE' || !hasDetectedInvoice(result.invoice)) throw new Error('Không nhận diện được hóa đơn. Hãy kiểm tra ảnh.');
        return result;
      },
      settled: (job, result) => {
        if ('value' in result) update(job.id, {status: 'READY', result: result.value});
        else update(job.id, {status: 'ERROR', error: result.error});
      }
    });
    if (generation === batchGenerationRef.current && !controller.signal.aborted) {
      const failed = batchJobsRef.current.filter(job => job.status === 'ERROR').length;
      if (failed) toast.warning(`Đã đọc xong lô; ${failed} tệp cần thử lại.`);
      else toast.success(`Đã đọc ${batchJobsRef.current.length} chứng từ.`);
    }
  };

  const handleFilesUpload = async (files: File[]): Promise<void> => {
    if (evaluationLockRef.current) return;
    if (files.length === 1) return handleDocumentUpload(files[0]);
    if (!files.length) return;
    if (files.length > DOCUMENT_BATCH_LIMIT) {toast.error('Mỗi lượt tối đa 20 chứng từ.'); return;}
    const jobs: BatchJob[] = files.map(file => {
      const error = documentFileError(file);
      return {id: `BATCH-${crypto.randomUUID()}`, file, status: error ? 'ERROR' : 'QUEUED', error: error || undefined};
    });
    batchDraftsRef.current.clear(); batchJobsRef.current = jobs; setBatchJobs(jobs);
    showBatchJob(jobs[0]);
    await runBatch(jobs.filter(job => job.status === 'QUEUED'));
  };

  const stopBatch = (): void => {
    batchGenerationRef.current++; batchAbortRef.current?.abort();
    batchJobsRef.current = batchJobsRef.current.map(job => job.status === 'QUEUED' || job.status === 'PROCESSING'
      ? {...job, status: 'CANCELLED', error: 'Đã dừng đọc; có thể thử lại.'} : job);
    setBatchJobs(batchJobsRef.current);
    const active = batchJobsRef.current.find(job => job.id === activeBatchIdRef.current);
    if (active?.status === 'CANCELLED') setIsParsingDocument(false);
  };

  const retryBatch = (): void => {
    const retry = batchJobsRef.current.filter(job => job.status === 'ERROR' || job.status === 'CANCELLED');
    for (const job of retry) batchDraftsRef.current.delete(job.id);
    batchJobsRef.current = batchJobsRef.current.map(job => retry.some(item => item.id === job.id) ? {...job, status: 'QUEUED', error: undefined} : job);
    setBatchJobs(batchJobsRef.current);
    void runBatch(retry);
  };

  const handleRawTextParse = async () => {
    if (!pastedText.trim()) {
      toast.error('Vui lòng dán nội dung hóa đơn hoặc văn bản trước.');
      return;
    }
    parseAbortRef.current?.abort();
    const requestId = ++parseRequestIdRef.current;
    extractionStartRef.current={requestId,started:performance.now(),complete:false,cacheHit:false};
    setExtractionTiming(null);
    const controller = new AbortController();
    parseAbortRef.current = controller;
    setIsParsingDocument(true);
    setDocumentWarnings([]);
    setFormErrors({});
    setUploadedFile(null);
    setPreviewFileType(null);

    try {
      const response = await fetch('/api/documents/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: pastedText }),
        signal: controller.signal
      });
      const data = await response.json();
      if (requestId !== parseRequestIdRef.current) return;
      if (!response.ok) throw new Error(data.error || 'Lỗi bóc tách văn bản');
      extractionStartRef.current={requestId,started:extractionStartRef.current!.started,complete:true,cacheHit:false};
      const extracted = Object.fromEntries(
        Object.entries(data.invoice || {}).filter(([, value]) => value !== undefined && value !== null && value !== '')
      );
      if (!Object.keys(extracted).length) {
        toast.error('Không nhận diện được dữ liệu hóa đơn. Hãy kiểm tra nội dung hoặc nhập thủ công.');
        return;
      }
      setEvaluationRevision(undefined);
      setFormData(() => ({
        invoiceNumber:'',invoiceDate:'',supplierTaxCode:'',supplierName:'',itemName:'',preTaxAmount:0,taxRate:undefined as unknown as InvoiceInput['taxRate'],taxAmount:0,totalAmount:0,paymentMethod:undefined,hasBankSlip:undefined,hasItemManifest:undefined,sellerStatus:'UNKNOWN',isImageBlurry:false,isAdjustment:false,
        ...extracted,
        sourceArtifactId: data.artifactId,
        sourceHash: data.sourceHash,
        id: `DOC-${Date.now()}`
      } as InvoiceInput));
      setDocumentWarnings(data.warnings || []);
      setUncertainFields(data.uncertainFields || []);
      setFieldWarnings(data.fieldWarnings || {});
      setFieldEvidence(data.fieldEvidence || {});
      setSupplierIdentity(data.supplierIdentity);
      setOcrHighlights(data.ocrHighlights || []);
      setLastResult(null);
      notifyExtractionQuality(data);
    } catch (error) {
      if (requestId !== parseRequestIdRef.current || (error instanceof Error && error.name === 'AbortError')) return;
      const msg = error instanceof Error ? error.message : 'Không thể bóc tách văn bản';
      toast.error(msg);
    } finally {
      if (requestId === parseRequestIdRef.current) setIsParsingDocument(false);
    }
  };

  // Nút: Hóa đơn tiếp theo -> Dọn sạch hóa đơn cũ và đưa khung upload quay trở lại
  const handleNextInvoice = () => {
    if (evaluationLockRef.current) return;
    if (batchJobsRef.current.length) {
      const index = batchJobsRef.current.findIndex(job => job.id === activeBatchIdRef.current);
      selectBatchJob(batchJobsRef.current[(index + 1) % batchJobsRef.current.length].id);
      return;
    }
    captureArtifactRef.current=null;
    savedFingerprintRef.current=null;
    setExtractionTiming(null);
    extractionStartRef.current=null;
    parseRequestIdRef.current += 1;
    parseAbortRef.current?.abort();
    parseAbortRef.current = null;
    autoLookupAbortRef.current?.abort();
    autoLookupAbortRef.current = null;
    supplierIdentityUserEditedRef.current = false;
    setIsParsingDocument(false);
    setTaxLookupLoading(false);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setUploadedFile(null);
    setPreviewUrl(null);
    setPreviewFileType(null);
    setXmlContent(null);
    setPastedText('');
    setDocumentWarnings([]);
    setUncertainFields([]);
    setFieldWarnings({});
    setFieldEvidence({});
    setSupplierIdentity(undefined);
    setFormErrors({});
    setOcrHighlights([]);
    setLastResult(null);
    setEvaluationRevision(undefined);
    setFormData({
      id: `INV-${Date.now()}`,
      invoiceNumber: '',
      invoiceDate: '',
      supplierTaxCode: '',
      supplierName: '',
      itemName: '',
      preTaxAmount: 0,
      taxRate: undefined as unknown as InvoiceInput['taxRate'],
      taxAmount: 0,
      totalAmount: 0,
      paymentMethod: undefined,
      hasBankSlip: undefined,
      hasItemManifest: undefined,
      sellerStatus: 'UNKNOWN',
      isImageBlurry: false,
      isAdjustment: false,
      isStaffReimbursed: false
    } as InvoiceInput);
  };

  const closeBatch = (): void => {
    if (batchJobsRef.current.some(job => !job.evaluated) && !window.confirm('Đóng lô sẽ bỏ các bản nháp chưa thẩm định. Tiếp tục?')) return;
    stopBatch(); batchJobsRef.current = []; setBatchJobs([]);
    activeBatchIdRef.current = null; setActiveBatchId(null); batchDraftsRef.current.clear();
    handleNextInvoice();
  };

  const changeInputMode = (nextMode: 'FILE' | 'PASTE') => {
    if (evaluationLockRef.current) return;
    if (inputMode === nextMode) return;
    if (batchJobsRef.current.length) {toast.info('Đóng lô chứng từ trước khi đổi cách tiếp nhận.'); return;}
    const hasUnsavedData = hasDocument || Boolean(
      pastedText.trim() || formData.invoiceNumber || formData.invoiceDate || formData.supplierTaxCode
      || formData.supplierName || formData.itemName || formData.totalAmount > 0
      || formData.taxRate !== undefined || formData.paymentMethod || formData.hasBankSlip !== undefined
      || formData.hasItemManifest !== undefined || formData.sellerStatus !== 'UNKNOWN'
    );
    if (hasUnsavedData && !window.confirm('Đổi cách tiếp nhận sẽ xóa dữ liệu chứng từ hiện tại. Bạn có muốn tiếp tục không?')) return;
    handleNextInvoice();
    setInputMode(nextMode);
  };

  const applySampleText = (type: 'ROUTINE' | 'CASH_5M') => {
    if (type === 'CASH_5M') {
      setPastedText(
        `Số HĐ: 0048123\nNgày lập: 2026-03-15\nĐơn vị bán: Công ty Cổ phần Vận tải Taxi Mai Linh\nMST: 0101234567\nHàng hóa: Cước dịch vụ vận chuyển đưa đón đoàn chuyên gia\nTổng thanh toán: 20.350.000 VNĐ\nThuế suất: 10%\nHình thức thanh toán: Tiền mặt`
      );
    } else {
      setPastedText(
        `Số HĐ: 0019283\nNgày lập: 2026-03-20\nĐơn vị bán: Tập đoàn Bưu chính Viễn thông Việt Nam (VNPT)\nMST: 0100684378\nHàng hóa: Cước cáp quang Internet định kỳ tháng 03/2026\nTổng thanh toán: 1.650.000 VNĐ\nThuế suất: 10%\nHình thức thanh toán: Chuyển khoản ngân hàng`
      );
    }
  };

  const handleInputChange = (field: keyof InvoiceInput, value: any) => {
    setLastResult(null);
    if (activeBatchIdRef.current) {
      batchJobsRef.current = batchJobsRef.current.map(job => job.id === activeBatchIdRef.current ? {...job, evaluated: false} : job);
      setBatchJobs(batchJobsRef.current);
    }
    if (field === 'supplierName' || field === 'supplierTaxCode' || field === 'supplierAddress') {
      supplierIdentityUserEditedRef.current = true;
      setSupplierIdentity(undefined);
    }
    setFormData((prev) => {
      const updated = { ...prev, [field]: value };
      if (field === 'preTaxAmount' || field === 'taxRate') {
        const pre = field === 'preTaxAmount' ? Number(value) : updated.preTaxAmount;
        const rate = field === 'taxRate' ? (value === undefined ? undefined : Number(value)) : updated.taxRate;
        if (rate === undefined) {
          updated.taxAmount = 0;
          updated.totalAmount = pre;
        } else {
          const tax = Number((pre * (rate / 100)).toFixed(0));
          updated.taxAmount = tax;
          updated.totalAmount = pre + tax;
        }
      }
      return updated;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (evaluationLockRef.current || isEvaluating || isParsingDocument) return;
    const currentJob = batchJobsRef.current.find(job => job.id === activeBatchIdRef.current);
    if (currentJob && currentJob.status !== 'READY') {toast.warning('Chứng từ chưa đọc xong; hãy thử lại hoặc chọn tệp khác.'); return;}
    const errors: Record<string, string> = {};
    if (formData.invoiceDate && !/^\d{4}-\d{2}-\d{2}$/.test(formData.invoiceDate)) errors.invoiceDate='Ngày sai định dạng.';
    for(const field of ['preTaxAmount','taxAmount','totalAmount'] as const) if(!Number.isFinite(formData[field])) errors[field]='Số tiền sai định dạng.';
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      toast.error('Kiểm tra các trường được đánh dấu trước khi thẩm định.');
      return;
    }

    setFormErrors({});
    evaluationLockRef.current = true;
    setIsEvaluating(true);
    try {
      const submitted:Record<string,unknown>={...formData,sourceUncertainFields:uncertainFields};
      for(const field of ['invoiceNumber','invoiceDate','supplierTaxCode','supplierName','itemName']) if(!String(submitted[field] || '').trim()) delete submitted[field];
      const payload = {
        invoice: submitted,
        expectedRevision: evaluationRevision,
        policyConfig: dynamicConfig,
        sourceUncertainFields: uncertainFields,
        mode: demoMode ? 'DEMO' : 'PRODUCTION',
        demo: demoMode
      };

      const res = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const rawText = await res.text();
      let data: any;
      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error(`Máy chủ phản hồi lỗi (${res.status}): ${rawText.slice(0, 120)}`);
      }
      if (!res.ok) throw new Error(data.error || 'Lỗi thẩm định');

      const decision: RefereeDecision = data.decision;
      setFormData(prev => ({...prev, id: decision.invoiceId}));
      setEvaluationRevision(data.workflow.revision);
      setLastEngine(data.engine || decision.engineUsed || null);

      if (decision.status === 'ROUTINE') {
        // Thông báo theo trạng thái hồ sơ thật: khi tự động hóa đang dừng, ca thường quy chờ KTT duyệt tay.
        const held = data.workflow?.autoApproved === false;
        setLastResult({
          status: 'ROUTINE',
          message: held ? 'Tự động hóa đang dừng: ca thường quy chờ Kế toán trưởng duyệt tay.' : decision.plainExplanation,
          approvedTax: held ? 0 : decision.approvedTaxAmount,
          held
        });
      } else {
        setLastResult({
          status: 'ESCALATED',
          message: decision.actionableQuestion,
          riskGroup: decision.riskGroup
        });
      }

      savedFingerprintRef.current=JSON.stringify({...formData,id:decision.invoiceId});
      if (activeBatchIdRef.current) {
        batchJobsRef.current = batchJobsRef.current.map(job => job.id === activeBatchIdRef.current ? {...job, evaluated: true} : job);
        setBatchJobs(batchJobsRef.current);
      }
      onEvaluateResult(decision, {...formData, id: decision.invoiceId}, {stayOnReceive: Boolean(activeBatchIdRef.current)});
      if (activeBatchIdRef.current) toast.success(`Đã thẩm định hóa đơn ${formData.invoiceNumber || 'trong lô'}.`);
    } catch (err) {
      toast.error(err instanceof Error&&err.message.length<=100?err.message:'Không thể thẩm định. Hãy thử lại.');
    } finally {
      evaluationLockRef.current = false;
      setIsEvaluating(false);
    }
  };

  const batchInputLocked = Boolean(activeBatchId && batchJobs.find(job => job.id === activeBatchId)?.status !== 'READY');
  const inputLocked = isEvaluating || isParsingDocument || batchInputLocked;
  const Heading=demoMode?'h2':'h1';
  return (
    <div className="h-full min-h-0 flex flex-col gap-2">
      {extractionTiming && <p role="status" data-testid="extraction-timing" data-elapsed-ms={extractionTiming.elapsedMs} data-cache-hit={String(extractionTiming.cacheHit)} className="sr-only">
        Đã điền dữ liệu sau {(extractionTiming.elapsedMs/1000).toFixed(2)} giây{extractionTiming.cacheHit ? ' · kết quả đã lưu của cùng chứng từ' : ''}. Kiểm tra các trường chưa xác minh trước khi thẩm định.
      </p>}
      {(isParsingDocument || isEvaluating || lastResult) && <p role="status" className="sr-only">{isParsingDocument ? 'Đang đọc chứng từ…' : isEvaluating ? 'Đang kiểm tra quy tắc…' : lastResult?.status === 'ROUTINE' ? (lastResult.held ? 'Thường quy, chờ Kế toán trưởng duyệt tay vì tự động hóa đang dừng.' : 'Đã tự xử lý và tạo chứng từ nội bộ.') : 'Đã dừng để xác minh / phê duyệt.'}</p>}
      {/* ================= HEADER THANH ĐIỀU HƯỚNG CHẾ ĐỘ ================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-2">
        <Heading className="text-2xl font-semibold tracking-tight text-foreground">Tiếp nhận chứng từ</Heading>

        <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-lg border border-slate-200 self-start sm:self-auto shrink-0">
          <button
            type="button"
            onClick={() => changeInputMode('FILE')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition cursor-pointer ${
              inputMode === 'FILE'
                ? 'bg-white text-slate-950 shadow-none'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Tải chứng từ
          </button>
          <button
            type="button"
            onClick={() => changeInputMode('PASTE')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition cursor-pointer ${
              inputMode === 'PASTE'
                ? 'bg-white text-slate-950 shadow-none'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Dán văn bản
          </button>
        </div>
      </div>

      {batchJobs.length > 0 && <ReceptionBatchQueue items={batchJobs} activeId={activeBatchId} evaluating={isEvaluating}
        onSelect={selectBatchJob} onRetry={retryBatch} onStop={stopBatch} onClose={closeBatch}/>}

      {/* ================= 2 CỘT SONG SONG: CHIỀU CAO ĐỒNG BỘ 100% GIỮA UPLOAD VÀ XEM FILE ================= */}
      <ReceptionLayout>

        {/* -------------------------------------------------------------
            CỘT BÊN TRÁI (COL-SPAN-6): KHUNG UPLOAD HOẶC HIỂN THỊ HÓA ĐƠN
        ------------------------------------------------------------- */}
        <div className="reception-pane">
          
          {/* TRƯỜNG HỢP 1: CHƯA UPLOAD -> KHUNG UPLOAD CHIẾM TRỌN CHIỀU CAO BẰNG CỘT PHẢI */}
          {!hasDocument ? <ReceptionUpload mode={inputMode} busy={isParsingDocument||isEvaluating} fileRef={fileInputRef} upload={handleDocumentUpload} uploadMany={handleFilesUpload} onCapture={()=>setCaptureDialogOpen(true)} text={pastedText} onText={setPastedText} onParse={handleRawTextParse} onSample={applySampleText}/> : (
            /* TRƯỜNG HỢP 2: ĐÃ UPLOAD -> KHUNG UPLOAD BIẾN MẤT, HIỂN THỊ FILE CHIẾM TRỌN CHIỀU CAO */
            <Card className="w-full h-full min-h-0 flex flex-col overflow-hidden border border-slate-200 shadow-none bg-white">
              
              {/* Header Preview Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2.5 bg-slate-100/80 border-b border-slate-200 text-xs shrink-0">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <Eye className="h-3.5 w-3.5 text-slate-700" />
                  <span className="font-medium text-slate-950 truncate max-w-[180px]">
                    {previewFileType === 'IMAGE' ? 'Ảnh hóa đơn' :
                     previewFileType === 'PDF' ? 'Chứng từ PDF' :
                     previewFileType === 'XML' ? 'Dữ liệu hóa đơn XML' :
                     'Văn bản đã dán'}
                  </span>
                </div>

                {/* Chế độ xem XML */}
                {previewFileType === 'XML' && (
                  <div className="flex items-center gap-1 bg-white p-0.5 rounded-md border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setXmlViewTab('VISUAL')}
                      className={`px-2 py-0.5 text-[11px] font-medium rounded transition cursor-pointer ${
                        xmlViewTab === 'VISUAL' ? 'bg-slate-950 text-white' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Bản Thể Hiện
                    </button>
                    <button
                      type="button"
                      onClick={() => setXmlViewTab('RAW')}
                      className={`px-2 py-0.5 text-[11px] font-medium rounded transition cursor-pointer ${
                        xmlViewTab === 'RAW' ? 'bg-slate-950 text-white' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Mã XML
                    </button>
                  </div>
                )}

                {previewFileType==='IMAGE'&&ocrHighlights.some(hl=>hl.bbox)&&<button type="button" onClick={()=>setShowOcrHighlights(v=>!v)} className="text-xs text-muted-foreground">{showOcrHighlights?'Ẩn':'Hiện'} vùng cần kiểm tra</button>}

              </div>

              {/* Vùng Hiển Thị Nội Dung File (Chiếm trọn không gian, không làm nhảy chiều cao) */}
              <div className="flex-1 min-h-0 overflow-hidden relative bg-slate-50/50 flex flex-col justify-start">
                
                {/* Shared image viewport: fits both dimensions without upscaling. */}
                {previewFileType==='IMAGE'&&previewUrl&&<InvoiceImageViewer src={previewUrl} busy={isParsingDocument}>
                  {showOcrHighlights&&ocrHighlights.filter(hl=>hl.field&&hl.bbox).map((hl,index)=>hl.bbox&&<button type="button" key={index} title="Đối chiếu trường trên chứng từ" aria-label={'Đối chiếu '+(hl.field||'trường dữ liệu')} className="absolute min-h-0 rounded border border-amber-500 bg-amber-300/20" style={{left:hl.bbox.x*100+'%',top:hl.bbox.y*100+'%',width:hl.bbox.w*100+'%',height:hl.bbox.h*100+'%'}} onClick={()=>{if(!hl.field)return;document.getElementsByName(hl.field)[0]?.focus();}}/>)}
                </InvoiceImageViewer>}

                {/* 2. Nếu là PDF */}
                {previewFileType === 'PDF' && previewUrl && (
                  <div className="w-full h-full min-h-0 flex-1 overflow-hidden">
                    <iframe
                      src={previewUrl}
                      title="Xem trước hóa đơn PDF"
                      className="w-full h-full border-none"
                    />
                  </div>
                )}

                {/* 3. Nếu là XML */}
                {previewFileType === 'XML' && (
                  xmlViewTab === 'RAW' ? (
                    <pre className="p-4 bg-slate-50 text-slate-800 font-mono text-[11px] overflow-auto w-full h-full whitespace-pre-wrap leading-relaxed">
                      {xmlContent || 'Đang tải mã nguồn XML...'}
                    </pre>
                  ) : (
                    <div className="w-full h-full min-h-0 overflow-auto p-4 flex flex-col items-center">
                      <div className="bg-white p-5 rounded-xl border border-slate-300 shadow-none text-xs text-slate-900 space-y-4 max-w-xl mx-auto font-sans w-full my-auto">
                        {/* Header HĐĐT */}
                        <div className="text-center border-b border-slate-200 pb-3">
                          <div className="text-[10px] uppercase font-medium tracking-wider text-slate-500">Cộng Hòa Xã Hội Chủ Nghĩa Việt Nam</div>
                          <div className="text-[9px] text-slate-500 font-medium">Độc lập - Tự do - Hạnh phúc</div>
                          <h3 className="text-base font-semibold uppercase text-slate-950 mt-2 tracking-wide">
                            HÓA ĐƠN GIÁ TRỊ GIA TĂNG
                          </h3>
                          <div className="text-[11px] text-slate-500 italic mt-0.5">(Bản thể hiện của hóa đơn điện tử)</div>
                          <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-dashed border-slate-200 text-left text-[11px]">
                            <div><span className="text-slate-500">Ký hiệu:</span> <span className="font-numeric font-medium">{formData.invoiceSeries || 'Chưa đọc được'}</span></div>
                            <div className="text-right"><span className="text-slate-500">Số HĐ:</span> <span className="font-numeric font-semibold text-slate-950 text-xs">{formData.invoiceNumber || '---'}</span></div>
                            <div><span className="text-slate-500">Ngày lập:</span> <span className="font-medium">{formatDate(formData.invoiceDate)}</span></div>
                            <div className="text-right"><span className="text-slate-500">Tiền tệ:</span> <span className="font-medium">VND</span></div>
                          </div>
                        </div>

                        {/* Bên bán */}
                        <div className="space-y-1 bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-[11px]">
                          <div className="font-semibold text-slate-950 uppercase">{formData.supplierName || 'Đơn vị bán hàng'}</div>
                          <div><span className="text-slate-500">Mã số thuế:</span> <span className="font-numeric font-medium text-slate-950">{formData.supplierTaxCode || '---'}</span></div>
                          <div><span className="text-slate-500">Hình thức TT:</span> <span className="font-medium">{formData.paymentMethod === 'CASH' ? 'Tiền mặt' : formData.paymentMethod === 'BANK_TRANSFER' ? 'Chuyển khoản' : 'Chưa xác định'}</span></div>
                        </div>

                        {/* Bảng hàng hóa */}
                        <div className="border border-slate-200 rounded-lg overflow-hidden">
                          <div className="grid grid-cols-12 bg-slate-100 p-2 text-[10px] font-medium uppercase text-slate-700 border-b border-slate-200">
                            <span className="col-span-1 text-center">STT</span>
                            <span className="col-span-6">Tên Hàng Hóa, Dịch Vụ</span>
                            <span className="col-span-2 text-center">Thuế Suất</span>
                            <span className="col-span-3 text-right">Thành Tiền</span>
                          </div>
                          <div className="grid grid-cols-12 p-2.5 text-[11px] items-center border-b border-slate-100">
                            <span className="col-span-1 text-center font-numeric">1</span>
                            <span className="col-span-6 font-semibold text-slate-900">{formData.itemName || 'Hàng hóa / dịch vụ'}</span>
                            <span className="col-span-2 text-center font-numeric font-medium text-slate-700">{formData.taxRate === undefined ? '-' : `${formData.taxRate}%`}</span>
                            <span className="col-span-3 text-right font-numeric font-medium text-slate-950">{formatVND(formData.preTaxAmount)}</span>
                          </div>
                        </div>

                        {/* Tổng kết tiền */}
                        <div className="space-y-1 text-right text-[11px] pt-1">
                          <div><span className="text-slate-500">Cộng tiền hàng:</span> <span className="font-numeric font-medium">{formatVND(formData.preTaxAmount)}</span></div>
                          <div><span className="text-slate-500">Tiền thuế GTGT ({formData.taxRate === undefined ? 'chưa rõ' : `${formData.taxRate}%`}):</span> <span className="font-numeric font-medium">{formatVND(formData.taxAmount)}</span></div>
                          <div className="text-sm font-semibold text-slate-950 border-t border-slate-200 pt-1.5 mt-1">
                            Tổng thanh toán: <span className="text-foreground font-numeric">{formatVND(formData.totalAmount)}</span>
                          </div>
                        </div>

                        {/* Chữ ký số */}
                        <div className="border border-emerald-200 bg-emerald-50/70 p-2 rounded-lg flex items-center justify-between text-[11px]">
                          <div className="flex items-center gap-1.5 text-emerald-900 font-medium">
                            <ShieldCheck className="h-4 w-4 text-emerald-700" />
                            <span>Chưa xác minh chữ ký số bên bán</span>
                          </div>
                          <span className="text-[10px] font-mono text-emerald-700">Signature Unverified</span>
                        </div>
                      </div>
                    </div>
                  )
                )}

                {/* 4. Nếu là Dán văn bản */}
                {inputMode === 'PASTE' && pastedText && !previewFileType && (
                  <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-none space-y-2 m-4 overflow-auto">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <span className="text-xs font-medium text-slate-900">Văn bản thô đã nạp</span>
                      <Badge variant="secondary" className="text-[10px] font-mono">{pastedText.length} ký tự</Badge>
                    </div>
                    <pre className="text-xs font-mono text-slate-800 whitespace-pre-wrap leading-relaxed overflow-auto">
                      {pastedText}
                    </pre>
                  </div>
                )}
              </div>

              {/* FOOTER BÊN DƯỚI: NÚT "HÓA ĐƠN TIẾP THEO" CĂN BÊN PHẢI (KHÔNG ĐÈ LÊN FILE) */}
              <div className="p-3 bg-white border-t border-slate-200 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 truncate text-xs">
                  {uploadedFile && (
                    <>
                      <FileCheck2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span className="font-medium text-slate-800 truncate max-w-[200px]">{uploadedFile.name}</span>
                      <span className="text-slate-500 font-mono text-[11px] shrink-0">({(uploadedFile.size / 1024).toFixed(1)} KB)</span>
                    </>
                  )}
                  {inputMode === 'PASTE' && (
                    <span className="text-slate-600 font-semibold">Đã nạp văn bản đối soát</span>
                  )}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleNextInvoice}
                  disabled={isParsingDocument||isEvaluating}
                  className="gap-1.5 font-medium text-xs h-8 text-slate-900 border-slate-300 hover:bg-slate-100 cursor-pointer shadow-none shrink-0 ml-2"
                >
                  <RotateCcw className="h-3.5 w-3.5 text-blue-600" />
                  <span>Hóa đơn tiếp theo</span>
                </Button>
              </div>
            </Card>
          )}

        </div>

        {/* -------------------------------------------------------------
            CỘT BÊN PHẢI (COL-SPAN-6): THÔNG TIN TRÍCH XUẤT ĐƯỢC VÀ FORM
        ------------------------------------------------------------- */}
        <div className="xl:col-span-6 flex flex-col h-full min-h-0 overflow-hidden">
          <Card className="w-full h-full min-h-0 border bg-card flex flex-col overflow-hidden">
            
            <div className="flex items-center justify-between border-b px-4 py-3 shrink-0">
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  Thông tin hóa đơn
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Đối chiếu với chứng từ trước khi gửi.
                </p>
              </div>

            </div>
            {/* Form Fields: Liền mạch, nút thẩm định nằm ngay bên dưới Tổng thanh toán */}
            <form id="extraction-form" onSubmit={handleSubmit} aria-busy={isParsingDocument || isEvaluating} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 text-sm text-foreground">
              <fieldset disabled={inputLocked} className="min-w-0 space-y-4 border-0 p-0">
              
              {/* Nhóm 1: Số HĐ & Ngày Lập */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="invoiceNumber" className="block text-xs font-medium text-slate-500">
                      Số hóa đơn
                    </label>
                  </div>
                  <input
                    id="invoiceNumber"
                    name="invoiceNumber"
                    type="text"
                    value={formData.invoiceNumber}
                    aria-invalid={Boolean(formErrors.invoiceNumber)}
                    onChange={(e) => handleInputChange('invoiceNumber', e.target.value)}
                    placeholder="VD: 0048123"
                    className={`w-full px-3 py-2 rounded-lg font-numeric font-medium text-xs outline-none transition-colors ${
                      formErrors.invoiceNumber
                        ? 'bg-rose-50 border-2 border-rose-400 ring-2 ring-rose-200 text-rose-950 focus:border-rose-600 focus:ring-rose-500'
                        : uncertainFields.includes('invoiceNumber')
                        ? 'bg-amber-50/90 border-2 border-amber-400 ring-2 ring-amber-300/40 text-amber-950 focus:border-amber-600 focus:ring-amber-500'
                        : 'bg-white border border-slate-200 text-slate-950 focus:border-slate-950 focus:ring-1 focus:ring-slate-950'
                    }`}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="invoiceDate" className="block text-xs font-medium text-slate-500">
                      Ngày lập
                    </label>
                  </div>
                  <input
                    id="invoiceDate"
                    name="invoiceDate"
                    type="date"
                    value={formData.invoiceDate}
                    aria-invalid={Boolean(formErrors.invoiceDate)}
                    onChange={(e) => handleInputChange('invoiceDate', e.target.value)}
                    onInput={(e) => handleInputChange('invoiceDate', e.currentTarget.value)}
                    className={`w-full px-3 py-2 rounded-lg font-numeric font-medium text-xs outline-none transition-colors ${
                      formErrors.invoiceDate
                        ? 'bg-rose-50 border-2 border-rose-400 ring-2 ring-rose-200 text-rose-950 focus:border-rose-600 focus:ring-rose-500'
                        : uncertainFields.includes('invoiceDate')
                        ? 'bg-amber-50/90 border-2 border-amber-400 ring-2 ring-amber-300/40 text-amber-950 focus:border-amber-600 focus:ring-amber-500'
                        : 'bg-white border border-slate-200 text-slate-950 focus:border-slate-950 focus:ring-1 focus:ring-slate-950'
                    }`}
                  />
                </div>
              </div>

              {/* Nhóm 2: MST & Tên Đơn Vị Bán (Tự động suy luận & đối chiếu 2 chiều) */}
              <div className="space-y-1.5">
                <div className="grid grid-cols-12 gap-2">
                  <div className="col-span-4">
                    <div className="flex items-center justify-between mb-1">
                      <label htmlFor="supplierTaxCode" className="block text-xs font-medium text-slate-500">
                        MST bên bán
                      </label>
                      <div className="flex items-center gap-1">
                        {taxLookupLoading && (
                          <Loader2 className="h-3.5 w-3.5 text-blue-600 animate-spin" />
                        )}
                      </div>
                    </div>
                    <div className="relative">
                      <input
                        id="supplierTaxCode"
                        name="supplierTaxCode"
                        type="text"
                        value={formData.supplierTaxCode}
                        aria-invalid={Boolean(formErrors.supplierTaxCode)}
                        onChange={(e) => handleInputChange('supplierTaxCode', e.target.value)}
                        placeholder="MST 10-13 số"
                        className={`w-full px-3 py-2 rounded-lg font-numeric font-medium text-xs outline-none transition-colors ${
                          formErrors.supplierTaxCode
                            ? 'bg-rose-50 border-2 border-rose-400 ring-2 ring-rose-200 text-rose-950 focus:border-rose-600 focus:ring-rose-500'
                            : (uncertainFields.includes('supplierTaxCode') && !neutralSupplierField('supplierTaxCode')) || supplierIdentity?.status === 'CONFLICT'
                            ? 'bg-amber-50/90 border-2 border-amber-400 ring-2 ring-amber-300/40 text-amber-950 focus:border-amber-600 focus:ring-amber-500'
                            : 'bg-white border border-slate-200 text-slate-950 focus:border-slate-950 focus:ring-1 focus:ring-slate-950'
                        }`}
                      />
                    </div>
                  </div>
                  <div className="col-span-8">
                    <div className="flex items-center justify-between mb-1">
                      <label htmlFor="supplierName" className="block text-xs font-medium text-slate-500">
                        Nhà cung cấp
                      </label>
                      <div className="flex items-center gap-1.5">
                        {supplierIdentity?.status === 'DEMO_MATCH' && <span title={supplierIdentity.message} className="text-[10px] font-medium text-muted-foreground">Danh mục demo</span>}
                        {supplierIdentity?.status === 'VERIFIED' && supplierIdentity.sources[0] && (
                          <a
                            href={supplierIdentity.sources[0].url}
                            target="_blank"
                            rel="noreferrer"
                            title={`Đã đối chiếu tên và MST${supplierIdentity.verifiedAt ? ` · ${new Date(supplierIdentity.verifiedAt).toLocaleDateString('vi-VN')}` : ''}${supplierIdentity.originalSupplierName ? ` · Tên trên ảnh: ${supplierIdentity.originalSupplierName}` : ''}`}
                            className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 hover:text-emerald-800"
                          >
                            <ShieldCheck className="h-3 w-3" /> Đã xác minh
                          </a>
                        )}
                        {taxLookupLoading && (
                          <Loader2 className="h-3.5 w-3.5 text-blue-600 animate-spin" />
                        )}
                      </div>
                    </div>
                    <div className="relative">
                      <input
                        id="supplierName"
                        name="supplierName"
                        type="text"
                        value={formData.supplierName}
                        aria-invalid={Boolean(formErrors.supplierName)}
                        onChange={(e) => handleInputChange('supplierName', e.target.value)}
                        placeholder="Tên pháp nhân bên bán"
                        className={`w-full px-3 py-2 rounded-lg font-medium text-xs outline-none transition-colors ${
                          formErrors.supplierName
                            ? 'bg-rose-50 border-2 border-rose-400 ring-2 ring-rose-200 text-rose-950 focus:border-rose-600 focus:ring-rose-500'
                            : uncertainFields.includes('supplierName') && !neutralSupplierField('supplierName')
                            ? 'bg-amber-50/90 border-2 border-amber-400 ring-2 ring-amber-300/40 text-amber-950 focus:border-amber-600 focus:ring-amber-500'
                            : 'bg-white border border-slate-200 text-slate-950 focus:border-slate-950 focus:ring-1 focus:ring-slate-950'
                        }`}
                      />
                    </div>
                  </div>
                </div>

              </div>

              {/* Nhóm 3: Nội Dung Hàng Hóa / Dịch Vụ */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="itemName" className="block text-xs font-medium text-slate-500">
                    Hàng hóa / dịch vụ
                  </label>
                </div>
                <input
                  id="itemName"
                  name="itemName"
                  type="text"
                  value={formData.itemName}
                  aria-invalid={Boolean(formErrors.itemName)}
                  onChange={(e) => handleInputChange('itemName', e.target.value)}
                  placeholder="Diễn giải tên hàng hóa, dịch vụ cung cấp"
                  className={`w-full px-3 py-2 rounded-lg font-medium text-xs outline-none transition-colors ${
                    formErrors.itemName
                      ? 'bg-rose-50 border-2 border-rose-400 ring-2 ring-rose-200 text-rose-950 focus:border-rose-600 focus:ring-rose-500'
                      : uncertainFields.includes('itemName')
                      ? 'bg-amber-50/90 border-2 border-amber-400 ring-2 ring-amber-300/40 text-amber-950 focus:border-amber-600 focus:ring-amber-500'
                      : 'bg-white border border-slate-200 text-slate-950 focus:border-slate-950 focus:ring-1 focus:ring-slate-950'
                  }`}
                />
              </div>

              {/* Nhóm 4: Tiền Trước Thuế & Thuế Suất & Hình Thức Thanh Toán */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="preTaxAmount" className="block text-xs font-medium text-slate-500">
                      Tiền trước thuế
                    </label>
                  </div>
                  <input
                    id="preTaxAmount"
                    name="preTaxAmount"
                    type="number"
                    value={formData.preTaxAmount}
                    aria-invalid={Boolean(formErrors.preTaxAmount)}
                    onChange={(e) => handleInputChange('preTaxAmount', Number(e.target.value))}
                    className={`w-full px-3 py-2 rounded-lg font-numeric font-medium text-xs outline-none transition-colors ${
                      formErrors.preTaxAmount
                        ? 'bg-rose-50 border-2 border-rose-400 ring-2 ring-rose-200 text-rose-950 focus:border-rose-600 focus:ring-rose-500'
                        : uncertainFields.includes('preTaxAmount') || uncertainFields.includes('totalAmount')
                        ? 'bg-amber-50/90 border-2 border-amber-400 ring-2 ring-amber-300/40 text-amber-950 focus:border-amber-600 focus:ring-amber-500'
                        : 'bg-white border border-slate-200 text-slate-950 focus:border-slate-950 focus:ring-1 focus:ring-slate-950'
                    }`}
                  />
                </div>

                <div>
                  <label htmlFor="taxRate" className="block text-xs font-medium text-slate-500 mb-1">
                    Thuế suất GTGT
                  </label>
                  <select
                    id="taxRate"
                    value={formData.taxRate ?? ''}
                    aria-invalid={Boolean(formErrors.taxRate)}
                    onChange={(e) => handleInputChange('taxRate', e.target.value === '' ? undefined : Number(e.target.value))}
                    className={`w-full px-2.5 py-2 rounded-lg bg-white border text-slate-950 font-numeric font-medium text-xs focus:border-slate-950 outline-none cursor-pointer ${formErrors.taxRate ? 'border-rose-400 ring-1 ring-rose-300' : 'border-slate-200'}`}
                  >
                    <option value="">Chưa xác định</option>
                    <option value={0}>0%</option>
                    <option value={5}>5%</option>
                    <option value={8}>8% (NQ 204)</option>
                    <option value={10}>10% (Chuẩn)</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="paymentMethod" className="block text-xs font-medium text-slate-500 mb-1">
                    Thanh toán
                  </label>
                  <select
                    id="paymentMethod"
                    value={formData.paymentMethod || ''}
                    aria-invalid={Boolean(formErrors.paymentMethod)}
                    onChange={(e) => handleInputChange('paymentMethod', e.target.value || undefined)}
                    className={`w-full px-2 py-2 rounded-lg bg-white border text-slate-950 font-medium text-xs focus:border-slate-950 outline-none cursor-pointer ${formErrors.paymentMethod ? 'border-rose-400 ring-1 ring-rose-300' : 'border-slate-200'}`}
                  >
                    <option value="">Chưa xác định</option>
                    <option value="BANK_TRANSFER">Chuyển khoản (CK)</option>
                    <option value="CASH">Tiền mặt (TM)</option>
                  </select>
                </div>
              </div>

              {/* Required or flagged facts remain visible without crowding routine intake. */}
              <details open={showSupplement || undefined} className="rounded-xl border px-3 py-2.5">
                <summary className="cursor-pointer text-xs font-medium">Bổ sung khi cần</summary>
                <div className="mt-3 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2 text-xs">
                    <label htmlFor="hasBankSlip" className="flex flex-col items-start gap-1.5 text-muted-foreground">
                      <span>Chứng từ thanh toán</span>
                      <select
                        id="hasBankSlip"
                        value={formData.hasBankSlip === undefined ? '' : formData.hasBankSlip ? 'yes' : 'no'}
                        aria-invalid={Boolean(formErrors.hasBankSlip)}
                        onChange={(e) => handleInputChange('hasBankSlip', e.target.value === '' ? undefined : e.target.value === 'yes')}
                        className={`w-full rounded-lg border bg-card px-2.5 py-2 text-xs font-medium text-foreground ${formErrors.hasBankSlip ? 'border-rose-400' : 'border-slate-200'}`}
                      >
                        <option value="">Chưa xác nhận</option>
                        <option value="yes">Có</option>
                        <option value="no">Không</option>
                      </select>
                    </label>
                    <label htmlFor="hasItemManifest" className="flex flex-col items-start gap-1.5 text-muted-foreground">
                      <span>Bảng kê hàng hóa</span>
                      <select
                        id="hasItemManifest"
                        value={formData.hasItemManifest === undefined ? '' : formData.hasItemManifest ? 'yes' : 'no'}
                        aria-invalid={Boolean(formErrors.hasItemManifest)}
                        onChange={(e) => handleInputChange('hasItemManifest', e.target.value === '' ? undefined : e.target.value === 'yes')}
                        className={`w-full rounded-lg border bg-card px-2.5 py-2 text-xs font-medium text-foreground ${formErrors.hasItemManifest ? 'border-rose-400' : 'border-slate-200'}`}
                      >
                        <option value="">Chưa xác nhận</option>
                        <option value="yes">Có</option>
                        <option value="no">Không</option>
                      </select>
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
                    <label className="flex items-center gap-1.5 cursor-pointer text-foreground">
                      <input
                        type="checkbox"
                        checked={!!formData.isStaffReimbursed}
                        onChange={(e) => handleInputChange('isStaffReimbursed', e.target.checked)}
                        className="rounded border-slate-300 text-slate-950 focus:ring-slate-950 w-3.5 h-3.5 cursor-pointer"
                      />
                      <span>Hoàn ứng nhân viên</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer text-foreground">
                      <input
                        type="checkbox"
                        checked={!!formData.isAdjustment}
                        onChange={(e) => handleInputChange('isAdjustment', e.target.checked)}
                        className="rounded border-slate-300 text-slate-950 focus:ring-slate-950 w-3.5 h-3.5 cursor-pointer"
                      />
                      <span>Hóa đơn điều chỉnh / thay thế</span>
                    </label>
                  </div>
                  <div>
                    <label htmlFor="sellerStatus" className="mb-1 block text-xs font-medium text-slate-500">Trạng thái bên bán</label>
                    <select
                      id="sellerStatus"
                      value={formData.sellerStatus}
                      aria-invalid={Boolean(formErrors.sellerStatus)}
                      onChange={(e) => handleInputChange('sellerStatus', e.target.value)}
                      className={`w-full rounded-lg border bg-white px-3 py-2 text-xs font-medium text-slate-950 outline-none ${formErrors.sellerStatus ? 'border-rose-400 ring-1 ring-rose-300' : 'border-slate-200'}`}
                    >
                      <option value="UNKNOWN">Chưa xác minh</option>
                      <option value="ACTIVE">Đang hoạt động</option>
                      <option value="SUSPENDED">Tạm ngừng</option>
                      <option value="CLOSED">Đã đóng mã số thuế</option>
                    </select>
                  </div>
                </div>
              </details>

              </fieldset>
            </form>
            <ReceptionSubmitBar taxRate={formData.taxRate} taxAmount={formData.taxAmount} totalAmount={formData.totalAmount} uncertain={uncertainFields.includes('totalAmount')||uncertainFields.includes('preTaxAmount')} busy={isEvaluating} disabled={inputLocked}/>

          </Card>
        </div>

      </ReceptionLayout>

      <CapturePhoneDialog open={captureDialogOpen} onOpenChange={setCaptureDialogOpen} onProcessingStart={startCaptureProcessing} onProcessingEnd={finishCaptureProcessing} onExtraction={applyCaptureExtraction} />
    </div>
  );
};

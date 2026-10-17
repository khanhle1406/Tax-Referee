import type {FieldEvidence, SupplierIdentity} from './schemas';

/** Neutral styling is not verification: original evidence and submission remain unchanged. */
export function isNeutralDemoSupplierField(field: string, identity: SupplierIdentity | undefined, warning?: string, evidence?: FieldEvidence): boolean {
  if (identity?.status !== 'DEMO_MATCH' || !['supplierName', 'supplierTaxCode'].includes(field)
    || evidence?.status === 'CONFLICT' || evidence?.status === 'ABSENT' || !warning) return false;
  return warning === identity.message || warning.startsWith('Danh mục demo')
    || warning === 'Dữ liệu danh mục demo; cần đối chiếu.';
}

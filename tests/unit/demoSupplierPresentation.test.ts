import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isNeutralDemoSupplierField } from '../../lib/demoSupplierPresentation';
import { FieldEvidence, SupplierIdentity } from '../../lib/schemas';

const identity: SupplierIdentity = {
  status: 'DEMO_MATCH', lookupMethod: 'DEMO_CATALOG', legalName: 'CÔNG TY MẪU KIỂM THỬ',
  supplierTaxCode: '0100000001', sources: [{title: 'Dữ liệu mẫu', url: 'https://example.invalid/sample'}],
  message: 'Danh mục demo · Dữ liệu tổng hợp kiểm thử'
};
const inferred: FieldEvidence = {source: 'INFERRED', status: 'UNCERTAIN', confidence: 0.6};

test('lý do riêng danh mục demo dùng trình bày trung tính cho đúng hai trường NCC', () => {
  for (const field of ['supplierName', 'supplierTaxCode']) {
    assert.equal(isNeutralDemoSupplierField(field, identity, identity.message, inferred), true);
    assert.equal(isNeutralDemoSupplierField(field, identity, 'Danh mục demo · Mẫu khác', inferred), true);
    assert.equal(isNeutralDemoSupplierField(field, identity, 'Dữ liệu danh mục demo; cần đối chiếu.', inferred), true);
  }
});

test('không che cảnh báo checksum, thiếu trường, mâu thuẫn hay lý do không xác định', () => {
  for (const warning of [
    'Mã số thuế đọc được không vượt qua kiểm tra chữ số; cần đối chiếu bản gốc.',
    'Chưa đọc được từ chứng từ gốc; cần bổ sung và xác minh.',
    'Tên và MST khác chứng từ gốc.',
    'Chứng từ chưa thể hiện rõ giá trị duy nhất; cần đối chiếu trước khi thẩm định.',
    undefined, ''
  ]) {
    assert.equal(isNeutralDemoSupplierField('supplierTaxCode', identity, warning, inferred), false);
    assert.equal(isNeutralDemoSupplierField('supplierName', identity, warning, inferred), false);
  }
});

test('evidence mâu thuẫn hoặc vắng mặt vẫn cần nổi bật kể cả có lời nhắc danh mục', () => {
  for (const status of ['CONFLICT', 'ABSENT'] as const) {
    for (const field of ['supplierName', 'supplierTaxCode']) {
      assert.equal(isNeutralDemoSupplierField(field, identity, identity.message, {...inferred, status}), false);
    }
  }
});

test('không áp dụng cho trạng thái khác hoặc bất kỳ trường nghiệp vụ còn lại', () => {
  for (const status of ['VERIFIED', 'AMBIGUOUS', 'NOT_FOUND', 'SOURCE_UNAVAILABLE', 'CONFLICT'] as const) {
    assert.equal(isNeutralDemoSupplierField('supplierTaxCode', {...identity, status}, identity.message, inferred), false);
  }
  assert.equal(isNeutralDemoSupplierField('supplierName', undefined, identity.message, inferred), false);
  for (const field of ['buyerTaxCode', 'invoiceNumber', 'totalAmount', 'taxRate', 'sellerStatus', 'supplierAddress', '']) {
    assert.equal(isNeutralDemoSupplierField(field, identity, identity.message, inferred), false);
  }
});

test('helper chỉ điều khiển hình thức, không thay trạng thái xác minh hoặc dữ kiện bằng chứng', () => {
  const demo = Object.freeze({...identity});
  const evidence = Object.freeze({...inferred});
  const original = JSON.stringify({demo, evidence});
  assert.equal(isNeutralDemoSupplierField('supplierName', demo, demo.message, evidence), true);
  assert.equal(JSON.stringify({demo, evidence}), original);
  assert.equal(demo.status, 'DEMO_MATCH');
  assert.equal(evidence.status, 'UNCERTAIN');
  assert.equal(evidence.source, 'INFERRED');
  assert.equal(evidence.confidence, 0.6);
});

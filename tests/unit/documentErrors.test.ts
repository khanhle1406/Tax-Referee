import assert from 'node:assert/strict';
import { test } from 'node:test';
import { documentAiErrorMessage } from '../../lib/server/documentErrors';

test('lỗi đọc chứng từ phân biệt cấu hình, kết nối và giới hạn API, không lộ nội dung upstream', () => {
  const cases: Array<[unknown, RegExp]> = [
    [new Error('Chưa cấu hình đủ DEV_LLM_BASE_URL, DEV_LLM_API_KEY và DEV_LLM_MODEL'), /Thiếu cấu hình/],
    [new TypeError('fetch failed: private upstream details'), /Không kết nối/],
    [new DOMException('private upstream details', 'TimeoutError'), /phản hồi chậm/],
    [new Error('HTTP 401: private upstream details'), /Khóa API/],
    [new Error('HTTP 429: private upstream details'), /giới hạn lượt/],
    [new SyntaxError('private upstream details'), /chưa đầy đủ/],
    [new Error('private upstream details'), /chưa đọc được/]
  ];
  for (const [error, expected] of cases) {
    const message = documentAiErrorMessage(error);
    assert.match(message, expected);
    assert.ok(message.length <= 100, 'toast giữ thông báo cụ thể thay vì thay bằng lỗi chung');
    assert.ok(!message.includes('private upstream details'));
  }
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DOCUMENT_BATCH_CONCURRENCY, DOCUMENT_MAX_BYTES, documentFileError, runDocumentBatch } from '../../lib/documentBatch';

interface Pending<T> { promise: Promise<T>; resolve: (value: T) => void }
function pending<T>(): Pending<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return {promise, resolve};
}

test('hàng loạt chạy tối đa ba request, mỗi kết quả thuộc đúng tệp dù hoàn tất khác thứ tự', async () => {
  const jobs = Array.from({length: 7}, () => pending<number>());
  const starts: number[] = [];
  const results = new Map<number, number>();
  let active = 0;
  let peak = 0;
  const running = runDocumentBatch(jobs.map((_, index) => index), {
    signal: new AbortController().signal,
    started: item => { starts.push(item); active++; peak = Math.max(peak, active); },
    process: item => jobs[item].promise,
    settled: (item, result) => { active--; assert.ok('value' in result); results.set(item, result.value); }
  });
  assert.equal(DOCUMENT_BATCH_CONCURRENCY, 3);
  assert.deepEqual(starts, [0, 1, 2]);
  jobs[2].resolve(102);
  await Promise.resolve();
  assert.deepEqual(starts, [0, 1, 2, 3]);
  for (const index of [1, 3, 0, 4, 5, 6]) { jobs[index].resolve(index + 100); await Promise.resolve(); }
  await running;
  assert.equal(peak, 3);
  assert.equal(active, 0);
  assert.equal(results.size, 7);
  for (let index = 0; index < jobs.length; index++) assert.equal(results.get(index), index + 100);
});

test('hủy lô chặn tệp đang xếp hàng và bỏ kết quả trả về muộn', async () => {
  const controller = new AbortController();
  const work = pending<string>();
  const starts: number[] = [];
  const results: unknown[] = [];
  const running = runDocumentBatch([0, 1, 2, 3, 4], {
    signal: controller.signal,
    started: item => { starts.push(item); },
    process: (_item, signal) => { assert.equal(signal, controller.signal); return work.promise; },
    settled: (_item, result) => { results.push(result); }
  });
  controller.abort();
  work.resolve('kết quả của lần tiếp nhận cũ');
  await running;
  assert.deepEqual(starts, [0, 1, 2]);
  assert.deepEqual(results, []);
});

test('hủy trước khi bắt đầu không gửi request hoặc đổi trạng thái tệp', async () => {
  const controller = new AbortController();
  controller.abort();
  await runDocumentBatch([1], {
    signal: controller.signal,
    started: () => { assert.fail('không được bắt đầu'); },
    process: async () => { assert.fail('không được gửi'); },
    settled: () => { assert.fail('không được cập nhật'); }
  });
});

test('một tệp lỗi không làm mất kết quả các tệp khác hoặc ngừng hàng đợi', async () => {
  const results = new Map<number, {value: number} | {error: string}>();
  await runDocumentBatch([0, 1, 2, 3, 4], {
    signal: new AbortController().signal,
    started: () => undefined,
    process: async item => { if (item === 1) throw new Error('Tệp không hợp lệ'); return item * 2; },
    settled: (item, result) => { results.set(item, result); }
  });
  assert.equal(results.size, 5);
  assert.deepEqual(results.get(1), {error: 'Tệp không hợp lệ'});
  for (const item of [0, 2, 3, 4]) assert.deepEqual(results.get(item), {value: item * 2});
});

test('lỗi không chuẩn hoặc quá dài chỉ trả thông báo ngắn, lô rỗng không chạy', async () => {
  const errors: string[] = [];
  await runDocumentBatch([0, 1], {
    signal: new AbortController().signal, started: () => undefined,
    process: async item => { throw item === 0 ? {detail: 'upstream body'} : new Error('x'.repeat(121)); },
    settled: (_item, result) => { assert.ok('error' in result); errors.push(result.error); }
  });
  assert.deepEqual(errors, ['Không đọc được chứng từ. Hãy thử lại.', 'Không đọc được chứng từ. Hãy thử lại.']);
  await runDocumentBatch([], {
    signal: new AbortController().signal, started: () => assert.fail('lô rỗng'),
    process: async () => assert.fail('lô rỗng'), settled: () => assert.fail('lô rỗng')
  });
});

test('kiểm tra định dạng và biên dung lượng trước khi gửi từng chứng từ', () => {
  for (const name of ['a.xml', 'b.PDF', 'c.png', 'd.JPG', 'e.jpeg', 'f.WEBP']) {
    assert.equal(documentFileError({name, size: DOCUMENT_MAX_BYTES}), null);
    assert.notEqual(documentFileError({name, size: 0}), null);
    assert.notEqual(documentFileError({name, size: DOCUMENT_MAX_BYTES + 1}), null);
  }
  for (const name of ['a.svg', 'a.gif', 'a.jpg.exe', 'a', 'a.heic']) assert.notEqual(documentFileError({name, size: 1}), null);
});

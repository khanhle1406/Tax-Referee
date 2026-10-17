export const DOCUMENT_BATCH_LIMIT = 20;
export const DOCUMENT_BATCH_CONCURRENCY = 3;
export const DOCUMENT_MAX_BYTES = 15 * 1024 * 1024;

export function documentFileError(file: {name: string; size: number}): string | null {
  if (!/\.(xml|pdf|png|jpe?g|webp)$/i.test(file.name)) return 'Chọn XML, PDF, PNG, JPG hoặc WEBP.';
  if (file.size === 0) return 'Tệp rỗng; hãy chọn lại chứng từ.';
  if (file.size > DOCUMENT_MAX_BYTES) return 'Mỗi chứng từ tối đa 15 MB.';
  return null;
}

/** Each request owns its result. Abort prevents queued work and ignores late completions. */
export async function runDocumentBatch<T, R>(items: readonly T[], options: {
  signal: AbortSignal;
  process: (item: T, signal: AbortSignal) => Promise<R>;
  started: (item: T) => void;
  settled: (item: T, result: {value: R} | {error: string}) => void;
}): Promise<void> {
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (!options.signal.aborted && cursor < items.length) {
      const item = items[cursor++];
      options.started(item);
      try {
        const value = await options.process(item, options.signal);
        if (!options.signal.aborted) options.settled(item, {value});
      } catch (error: unknown) {
        if (!options.signal.aborted) options.settled(item, {error: error instanceof Error && error.message.length <= 120
          ? error.message : 'Không đọc được chứng từ. Hãy thử lại.'});
      }
    }
  };
  await Promise.all(Array.from({length: Math.min(DOCUMENT_BATCH_CONCURRENCY, items.length)}, () => worker()));
}

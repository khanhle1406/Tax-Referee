/** Short, actionable messages for toasts; never expose upstream response bodies. */
export function documentAiErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return 'API chưa đọc được chứng từ. Vui lòng thử lại.';
  if (error.message.includes('Chưa cấu hình') && error.message.includes('DEV_LLM_')) {
    return 'Thiếu cấu hình API đọc chứng từ trên máy này. Hãy khởi động lại bằng npm run dev.';
  }
  if (error.name === 'TimeoutError' || error.name === 'AbortError') {
    return 'API đọc chứng từ phản hồi chậm. Vui lòng thử lại.';
  }
  if (error instanceof TypeError) return 'Không kết nối được API đọc chứng từ. Vui lòng thử lại.';
  if (/HTTP (401|403)\b/.test(error.message)) return 'Khóa API đọc chứng từ không hợp lệ hoặc chưa được cấp quyền.';
  if (/HTTP 429\b/.test(error.message)) return 'API đang giới hạn lượt đọc chứng từ. Vui lòng thử lại sau.';
  if (error instanceof SyntaxError) return 'API trả dữ liệu chưa đầy đủ. Vui lòng đọc lại chứng từ.';
  return 'API chưa đọc được chứng từ. Vui lòng thử lại.';
}

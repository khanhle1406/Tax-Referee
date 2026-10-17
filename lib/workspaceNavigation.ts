import type { InboxFilterState } from '@/components/InboxFilterToolbar';

export const workspaceRoutes = {
  dashboard: { path: '/workspace/dashboard', label: 'Tổng quan' },
  inbox: { path: '/workspace/inbox', label: 'Thẩm định' },
  receive: { path: '/workspace/receive', label: 'Tiếp nhận' },
  batches: { path: '/workspace/batches', label: 'Lô hóa đơn' },
  channels: { path: '/workspace/channels', label: 'Hộp thư vào' },
  history: { path: '/workspace/history', label: 'Lịch sử của tôi' },
  approval: { path: '/workspace/approvals', label: 'Chờ duyệt' },
  dossier: { path: '/workspace/audit', label: 'Nhật ký' },
  suppliers: { path: '/workspace/suppliers', label: 'Nhà cung cấp' },
  banking: { path: '/workspace/banking', label: 'Đối soát ngân hàng' },
  reconciliation: { path: '/workspace/reconciliation', label: 'Đối soát TCT' },
  reports: { path: '/workspace/reports', label: 'Báo cáo thuế' },
  notifications: { path: '/workspace/notifications', label: 'Thông báo' },
  policy: { path: '/workspace/policy', label: 'Quy chế' },
  ledger: { path: '/workspace/ledger', label: 'ERP' },
} as const;
export type WorkspaceView = keyof typeof workspaceRoutes;
export type InvoiceTab = 'review' | 'source' | 'history';

export function viewForPath(pathname: string): WorkspaceView {
  return (Object.keys(workspaceRoutes) as WorkspaceView[]).find(key => workspaceRoutes[key].path === pathname) || 'inbox';
}
export function invoiceIdForPath(pathname: string): string | null {
  const match = /^\/workspace\/invoices\/([^/]+)$/.exec(pathname);
  if (!match) return null;
  try { return decodeURIComponent(match[1]); } catch { return null; }
}
export function readInboxFilters(params: URLSearchParams): InboxFilterState {
  const risk = params.get('risk'); const amount = params.get('amount'); const status = params.get('status');
  return {
    searchTerm: (params.get('search') || '').slice(0, 200),
    riskGroup: risk === 'ROUTINE' || risk === 'UNCERTAIN_INFO' || risk === 'OUT_OF_POLICY' || risk === 'EXCEED_AUTHORITY' ? risk : 'ALL',
    amountRange: amount === 'UNDER_5M' || amount === '5M_TO_20M' || amount === '20M_TO_200M' || amount === 'ABOVE_200M' ? amount : 'ALL',
    approvalStatus: status === 'PENDING' || status === 'APPROVED' || status === 'REJECTED' ? status : 'ALL',
  };
}
export function writeInboxFilters(filters: InboxFilterState): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.searchTerm) params.set('search', filters.searchTerm);
  if (filters.riskGroup !== 'ALL') params.set('risk', filters.riskGroup);
  if (filters.amountRange !== 'ALL') params.set('amount', filters.amountRange);
  if (filters.approvalStatus !== 'ALL') params.set('status', filters.approvalStatus);
  return params;
}
export function readInvoiceTab(params: URLSearchParams): InvoiceTab {
  const tab = params.get('tab'); return tab === 'source' || tab === 'history' ? tab : 'review';
}
export function invoiceReturnPath(params: URLSearchParams): string {
  const base = params.get('from') === 'approval' ? workspaceRoutes.approval.path : workspaceRoutes.inbox.path;
  const filters=writeInboxFilters(readInboxFilters(params));const page=readListPage(params);if(page>1)filters.set('page',String(page));
  const query = filters.toString();
  return query ? `${base}?${query}` : base;
}
export function readListPage(params:URLSearchParams):number {
  const page=Number(params.get('page')||1);return Number.isInteger(page)&&page>=1&&page<=8?page:1;
}
/** Next's native History integration updates search params without a server navigation. */
export function replaceWorkspaceQuery(pathname:string,params:URLSearchParams):void {
  const query=params.toString();window.history.replaceState(null,'',pathname+(query?'?'+query:''));
}

'use client';

import React from 'react';
import { Search, X, Filter, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export interface InboxFilterState {
  searchTerm: string;
  riskGroup: 'ALL' | 'ROUTINE' | 'UNCERTAIN_INFO' | 'OUT_OF_POLICY' | 'EXCEED_AUTHORITY';
  amountRange: 'ALL' | 'UNDER_5M' | '5M_TO_20M' | '20M_TO_200M' | 'ABOVE_200M';
  approvalStatus: 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED';
}

export const DEFAULT_FILTER_STATE: InboxFilterState = {
  searchTerm: '',
  riskGroup: 'ALL',
  amountRange: 'ALL',
  approvalStatus: 'ALL'
};

interface InboxFilterToolbarProps {
  filters: InboxFilterState;
  onChange: (filters: InboxFilterState) => void;
  totalCount: number;
  filteredCount: number;
}

export const InboxFilterToolbar: React.FC<InboxFilterToolbarProps> = ({
  filters,
  onChange,
  totalCount,
  filteredCount
}) => {
  const isFiltered =
    filters.searchTerm.trim() !== '' ||
    filters.riskGroup !== 'ALL' ||
    filters.amountRange !== 'ALL' ||
    filters.approvalStatus !== 'ALL';

  const handleReset = () => {
    onChange(DEFAULT_FILTER_STATE);
  };

  return (
    <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm space-y-3">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search input with live debouncing/clearing */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={filters.searchTerm}
            onChange={(e) => onChange({ ...filters, searchTerm: e.target.value })}
            placeholder="Tìm theo số HĐ, MST, NCC hoặc tên hàng..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-9 pr-9 py-2 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 transition"
          />
          {filters.searchTerm && (
            <button
              onClick={() => onChange({ ...filters, searchTerm: '' })}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              title="Xóa tìm kiếm"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Counter badge and Reset button */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <Badge
            variant="secondary"
            className="bg-slate-100 text-slate-700 font-mono text-xs px-2.5 py-1 font-semibold"
          >
            {filteredCount} / {totalCount} hồ sơ
          </Badge>

          {isFiltered && (
            <button
              onClick={handleReset}
              className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2.5 py-1 rounded-lg transition"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Đặt lại</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Selectors Pills */}
      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 text-xs">
        <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px] mr-1 flex items-center gap-1">
          <Filter className="h-3 w-3" /> Lọc nhanh:
        </span>

        {/* Risk Group Filter */}
        <select
          value={filters.riskGroup}
          onChange={(e) => onChange({ ...filters, riskGroup: e.target.value as InboxFilterState['riskGroup'] })}
          aria-label="Phân loại rủi ro"
          className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-slate-300 focus:border-sky-500 focus:bg-white focus:outline-none transition cursor-pointer"
        >
          <option value="ALL">Tất cả rủi ro</option>
          <option value="ROUTINE">Thường quy (ROUTINE)</option>
          <option value="UNCERTAIN_INFO">Nhóm 1: Chưa xác định thông tin</option>
          <option value="OUT_OF_POLICY">Nhóm 2: Ngoài quy định</option>
          <option value="EXCEED_AUTHORITY">Nhóm 3: Vượt thẩm quyền</option>
        </select>

        {/* Amount Range Filter */}
        <select
          value={filters.amountRange}
          onChange={(e) => onChange({ ...filters, amountRange: e.target.value as InboxFilterState['amountRange'] })}
          aria-label="Khoảng giá trị tiền"
          className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-slate-300 focus:border-sky-500 focus:bg-white focus:outline-none transition cursor-pointer"
        >
          <option value="ALL">Mọi mức giá trị</option>
          <option value="UNDER_5M">&lt; 5 triệu VNĐ (Tiền mặt hợp lệ)</option>
          <option value="5M_TO_20M">5M - 20 triệu VNĐ</option>
          <option value="20M_TO_200M">20M - 200 triệu VNĐ</option>
          <option value="ABOVE_200M">&gt;= 200 triệu VNĐ (Vượt hạn mức KTT)</option>
        </select>

        {/* Approval Status Filter */}
        <select
          value={filters.approvalStatus}
          onChange={(e) => onChange({ ...filters, approvalStatus: e.target.value as InboxFilterState['approvalStatus'] })}
          aria-label="Trạng thái phê duyệt"
          className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-slate-300 focus:border-sky-500 focus:bg-white focus:outline-none transition cursor-pointer"
        >
          <option value="ALL">Mọi trạng thái</option>
          <option value="PENDING">Đang chờ xử lý</option>
          <option value="APPROVED">Đã phê duyệt (APPROVED)</option>
          <option value="REJECTED">Đã từ chối (REJECTED)</option>
        </select>
      </div>
    </div>
  );
};

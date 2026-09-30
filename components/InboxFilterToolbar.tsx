'use client';

import React from 'react';
import { Search, X, RotateCcw } from 'lucide-react';

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
    <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3 shadow-subtle space-y-3">
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search input */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={filters.searchTerm}
            onChange={(e) => onChange({ ...filters, searchTerm: e.target.value })}
            placeholder="Tìm theo số HĐ, MST, tên NCC..."
            className="w-full rounded-lg border border-slate-200 bg-slate-50/70 pl-9 pr-9 py-2 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 transition"
          />
          {filters.searchTerm && (
            <button
              onClick={() => onChange({ ...filters, searchTerm: '' })}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-900 cursor-pointer"
              title="Xóa tìm kiếm"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Counter and Reset */}
        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
          <span className="rounded-lg bg-slate-100 border border-slate-200 text-slate-900 font-mono text-xs font-bold px-3 py-1.5">
            {filteredCount} / {totalCount} HĐ
          </span>

          {isFiltered && (
            <button
              onClick={handleReset}
              className="inline-flex items-center gap-1 text-xs font-bold text-slate-700 hover:text-slate-950 px-2 py-1.5 rounded transition cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Đặt lại</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Selectors - To & Rõ */}
      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 text-xs">
        <select
          value={filters.riskGroup}
          onChange={(e) => onChange({ ...filters, riskGroup: e.target.value as InboxFilterState['riskGroup'] })}
          aria-label="Phân loại rủi ro"
          className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-1.5 text-xs font-bold text-slate-800 hover:border-slate-400 focus:border-slate-900 focus:bg-white focus:outline-none transition cursor-pointer"
        >
          <option value="ALL">Tất cả phân loại</option>
          <option value="ROUTINE">Thường quy (Routine)</option>
          <option value="UNCERTAIN_INFO">Thông tin chưa rõ</option>
          <option value="OUT_OF_POLICY">Ngoài chính sách</option>
          <option value="EXCEED_AUTHORITY">Vượt thẩm quyền</option>
        </select>

        <select
          value={filters.amountRange}
          onChange={(e) => onChange({ ...filters, amountRange: e.target.value as InboxFilterState['amountRange'] })}
          aria-label="Khoảng tiền"
          className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-1.5 text-xs font-bold text-slate-800 hover:border-slate-400 focus:border-slate-900 focus:bg-white focus:outline-none transition cursor-pointer"
        >
          <option value="ALL">Mọi hạn mức tiền</option>
          <option value="UNDER_5M">&lt; 5 triệu</option>
          <option value="5M_TO_20M">5 - 20 triệu</option>
          <option value="20M_TO_200M">20 - 200 triệu</option>
          <option value="ABOVE_200M">&gt; 200 triệu</option>
        </select>

        <select
          value={filters.approvalStatus}
          onChange={(e) => onChange({ ...filters, approvalStatus: e.target.value as InboxFilterState['approvalStatus'] })}
          aria-label="Trạng thái xử lý"
          className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-1.5 text-xs font-bold text-slate-800 hover:border-slate-400 focus:border-slate-900 focus:bg-white focus:outline-none transition cursor-pointer"
        >
          <option value="ALL">Tất cả trạng thái</option>
          <option value="PENDING">Chờ xử lý</option>
          <option value="APPROVED">Đã chấp thuận</option>
          <option value="REJECTED">Đã từ chối</option>
        </select>
      </div>
    </div>
  );
};

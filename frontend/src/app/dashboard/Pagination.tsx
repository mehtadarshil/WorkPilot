'use client';

import React from 'react';

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  itemName?: string;
}

export function Pagination({ page, totalPages, total, pageSize, onPageChange, itemName = 'items' }: PaginationProps) {
  const currentPage = Number(page);
  const totalItems = Number(total);
  const limit = Number(pageSize);
  
  const start = (currentPage - 1) * limit;
  const end = Math.min(start + limit, totalItems);

  const pages: (number | string)[] = [];
  
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    // If we are in the first 3 pages, show 1-4 and then ...
    if (currentPage <= 3) {
      pages.push(1, 2, 3, 4, '...', totalPages);
    } 
    // If we are in the last 3 pages, show 1 ... and then last 4
    else if (currentPage >= totalPages - 2) {
      pages.push(1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
    } 
    // Otherwise show 1 ... CURRENT-1 CURRENT CURRENT+1 ... totalPages
    else {
      pages.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages);
    }
  }

  return (
    <div className="flex flex-col gap-4 border-t border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm text-slate-500">
        Showing{' '}
        <span className="font-semibold text-slate-900">
          {totalItems === 0 ? 0 : start + 1}
        </span>{' '}
        to <span className="font-semibold text-slate-900">{end}</span> of{' '}
        <span className="font-semibold text-slate-900">{totalItems}</span> {itemName}
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        {pages.map((p, i) => {
          if (p === '...') {
            return (
              <span
                key={`dots-${i}`}
                className="flex size-8 items-center justify-center text-slate-400"
              >
                ...
              </span>
            );
          }
          const num = p as number;
          const isActive = currentPage === num;
          return (
            <button
              key={`page-${num}`}
              type="button"
              onClick={() => onPageChange(num)}
              className={`flex size-8 items-center justify-center rounded-lg text-sm font-bold transition-all ${
                isActive
                  ? 'bg-[#14B8A6] text-white shadow-sm ring-2 ring-[#14B8A6]/20'
                  : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              {num}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage >= totalPages}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}

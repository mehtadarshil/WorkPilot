'use client';

import { Dispatch, SetStateAction } from 'react';
import { motion } from 'framer-motion';
import dayjs from 'dayjs';
import { DollarSign, Clock } from 'lucide-react';
import QuotationInternalNotesCard from './QuotationInternalNotesCard';
import type { QuotationInternalNote } from './QuotationInternalNotesCard';
import QuotationInternalCostingCard from '../QuotationInternalCostingCard';

type QuotationState = {
  value: string;
  label: string;
  color: string;
};

type Activity = {
  id: number;
  action: string;
  created_at: string;
};

type QuotationDetailSidebarProps = {
  quotationId: string;
  authToken: string | null;
  currency: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  taxLabel: string;
  stateOpt: QuotationState;
  internalNotes: QuotationInternalNote[];
  activities: Activity[];
  formatCurrency: (amount: number, currency: string) => string;
  onViewAllNotes: () => void;
  setQuotation: Dispatch<SetStateAction<any>>;
};

export default function QuotationDetailSidebar({
  quotationId,
  authToken,
  currency,
  subtotal,
  taxAmount,
  totalAmount,
  taxLabel,
  stateOpt,
  internalNotes,
  activities,
  formatCurrency,
  onViewAllNotes,
  setQuotation,
}: QuotationDetailSidebarProps) {
  return (
    <div className="no-print space-y-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-900">
          <DollarSign className="size-5 text-[#14B8A6]" />
          Quotation Summary
        </h3>
        <div className="space-y-4">
          <div className="flex justify-between text-sm py-2 border-b border-slate-50">
            <span className="text-slate-500 font-medium">Status</span>
            <span className={`font-bold px-2 py-0.5 rounded-md text-[10px] uppercase tracking-wider ${stateOpt.color}`}>
              {stateOpt.label}
            </span>
          </div>
          <div className="flex justify-between text-sm py-2 border-b border-slate-50">
            <span className="text-slate-500 font-medium">Subtotal</span>
            <span className="font-bold text-slate-900">{formatCurrency(subtotal, currency)}</span>
          </div>
          <div className="flex justify-between text-sm py-2 border-b border-slate-50">
            <span className="text-slate-500 font-medium">{taxLabel}</span>
            <span className="font-bold text-slate-900">{formatCurrency(taxAmount, currency)}</span>
          </div>
          <div className="flex justify-between pt-2">
            <span className="text-base font-bold text-slate-900">Total</span>
            <span className="text-lg font-black text-[#14B8A6]">{formatCurrency(totalAmount, currency)}</span>
          </div>
        </div>
      </motion.div>

      {authToken ? (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}>
          <QuotationInternalCostingCard quotationId={quotationId} authToken={authToken} currency={currency} />
        </motion.div>
      ) : null}

      {authToken ? (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
          <QuotationInternalNotesCard
            quotationId={quotationId}
            authToken={authToken}
            notes={internalNotes}
            onAppendNote={(note) =>
              setQuotation((q: any) => (q ? { ...q, internal_notes: [note, ...(q.internal_notes ?? [])] } : null))
            }
            onRemoveNote={(noteId) =>
              setQuotation((q: any) =>
                q ? { ...q, internal_notes: (q.internal_notes ?? []).filter((n: any) => n.id !== noteId) } : null,
              )
            }
            onUpdateNote={(noteId, newBody) =>
              setQuotation((q: any) =>
                q
                  ? {
                      ...q,
                      internal_notes: (q.internal_notes ?? []).map((n: any) =>
                        n.id === noteId ? { ...n, body: newBody } : n,
                      ),
                    }
                  : null,
              )
            }
          />
        </motion.div>
      ) : null}

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <Clock className="size-5 text-[#14B8A6]" />
            Recent Activity
          </h3>
          <button onClick={onViewAllNotes} className="text-xs font-bold text-[#14B8A6] hover:underline">
            View All
          </button>
        </div>
        <div className="space-y-4">
          {activities.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center italic">No activity yet</p>
          ) : (
            activities.slice(0, 5).map((a) => (
              <div key={a.id} className="relative pl-6 pb-2 last:pb-0 border-l border-slate-100">
                <div className="absolute left-[-5px] top-1.5 size-2.5 rounded-full border-2 border-white bg-[#14B8A6]" />
                <p className="text-sm font-bold text-slate-900">{a.action.replace(/_/g, ' ')}</p>
                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-tighter">
                  {dayjs(a.created_at).fromNow()}
                </p>
              </div>
            ))
          )}
        </div>
      </motion.div>
    </div>
  );
}

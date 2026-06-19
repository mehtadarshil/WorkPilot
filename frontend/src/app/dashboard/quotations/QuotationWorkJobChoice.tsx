'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Briefcase, GitBranch, X } from 'lucide-react';

export interface QuotationWorkJobChoiceProps {
  open: boolean;
  onClose: () => void;
  customerId: number;
  quotationId: number | string;
  visitJobId: number;
  workAddressId?: number | null;
}

export default function QuotationWorkJobChoice({
  open,
  onClose,
  customerId,
  quotationId,
  visitJobId,
  workAddressId,
}: QuotationWorkJobChoiceProps) {
  const router = useRouter();

  if (!open) return null;

  const workAddressQuery =
    workAddressId != null ? `&work_address_id=${encodeURIComponent(String(workAddressId))}` : '';

  const sameJobHref =
    `/dashboard/customers/${customerId}/jobs/new?edit=${visitJobId}&from_quotation=${encodeURIComponent(String(quotationId))}&convert_visit=1`;

  const newJobHref =
    `/dashboard/customers/${customerId}/jobs/new?from_quotation=${encodeURIComponent(String(quotationId))}${workAddressQuery}`;

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Set up work job</h3>
            <p className="mt-1 text-sm text-slate-500">
              Choose how this accepted quotation should become a work job.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="mt-5 space-y-3">
          <button
            type="button"
            onClick={() => go(sameJobHref)}
            className="flex w-full items-start gap-4 rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-left transition-colors hover:bg-amber-50"
          >
            <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-900">
              <Briefcase className="size-5" />
            </span>
            <span>
              <span className="block text-sm font-bold text-amber-950">Continue on this visit job</span>
              <span className="mt-1 block text-sm text-amber-900/80">
                This visit becomes the work job. Diary history, site notes, and the visit record stay on the same job.
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => go(newJobHref)}
            className="flex w-full items-start gap-4 rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 text-left transition-colors hover:bg-emerald-50"
          >
            <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-900">
              <GitBranch className="size-5" />
            </span>
            <span>
              <span className="block text-sm font-bold text-emerald-950">Create a new separate job</span>
              <span className="mt-1 block text-sm text-emerald-900/80">
                A new work job is created and linked to this quotation. The quotation visit remains as its own record.
              </span>
            </span>
          </button>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
          >
            Not now
          </button>
        </div>
      </motion.div>
    </div>
  );
}

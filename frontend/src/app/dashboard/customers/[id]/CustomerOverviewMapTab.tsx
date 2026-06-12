'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, CreditCard, Clock, StickyNote, HelpCircle } from 'lucide-react';

interface Invoice {
  id: number;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  total_paid: number;
  state: string;
}

interface CustomerDetails {
  id: number;
  full_name: string;
  credit_days: number | null;
  notes: string | null;
}

interface Props {
  customerId: string;
  workAddressId: string | null;
  customerDetails: CustomerDetails | null;
  invoices: Invoice[];
}

export default function CustomerOverviewMapTab({
  customerId,
  workAddressId,
  customerDetails,
  invoices,
}: Props) {
  // Outstanding balance calculation
  const outstandingInvoices = invoices.filter(
    (inv) => inv.state !== 'paid' && inv.state !== 'cancelled'
  );
  const totalOutstanding = outstandingInvoices.reduce(
    (sum, inv) => sum + (Number(inv.total_amount) - Number(inv.total_paid)),
    0
  );

  // Creative alerts / tags based on customer attributes
  const creditDays = customerDetails?.credit_days ?? 0;
  const rawNotes = (customerDetails?.notes || '').trim();

  // Look for credit/payment behavior flags in notes
  const paysLateHint = /late|slow|takes long|delay|overdue|outstanding/i.test(rawNotes);
  const badCreditHint = /credit limit|bad credit|hold|stop/i.test(rawNotes);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Top Section: Creative Outstanding Balance & Notes Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card 1: Outstanding Balance Visualizer */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-teal-500/10 to-transparent rounded-bl-full pointer-events-none" />
          
          <div>
            <div className="flex items-center gap-2 text-slate-500 text-sm font-semibold uppercase tracking-wider">
              <CreditCard className="size-4 text-[#14B8A6]" />
              <span>Outstanding Balance</span>
            </div>

            <div className="mt-3 flex items-baseline gap-2">
              <span className={`text-4xl font-extrabold tracking-tight ${totalOutstanding > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                £{totalOutstanding.toFixed(2)}
              </span>
              {totalOutstanding > 0 && (
                <span className="text-xs font-bold bg-rose-50 text-rose-700 px-2 py-0.5 rounded-full border border-rose-100">
                  {outstandingInvoices.length} unpaid
                </span>
              )}
            </div>
          </div>

          <div className="mt-6 border-t border-slate-100 pt-4 flex items-center justify-between text-xs text-slate-500">
            <div className="flex items-center gap-1.5">
              <Clock className="size-3.5 text-slate-400" />
              <span>Credit terms: <strong className="text-slate-700">{creditDays} days</strong></span>
            </div>
            {totalOutstanding > 0 ? (
              <span className="text-amber-700 font-medium">Requires follow-up</span>
            ) : (
              <span className="text-emerald-700 font-semibold flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-ping inline-block" /> Account Clear
              </span>
            )}
          </div>
        </div>

        {/* Card 2: Customer Payment & Behavior Notes */}
        <div className={`relative overflow-hidden rounded-2xl border p-6 shadow-sm flex flex-col justify-between transition-colors ${
          paysLateHint || badCreditHint 
            ? 'border-amber-200 bg-amber-50/20' 
            : 'border-slate-200 bg-white'
        }`}>
          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-slate-500 text-sm font-semibold uppercase tracking-wider">
                <StickyNote className="size-4 text-amber-500" />
                <span>Customer Behavior & Notes</span>
              </div>
              {(paysLateHint || badCreditHint) && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-extrabold uppercase bg-amber-100 text-amber-800 border border-amber-200 animate-pulse">
                  Alert Notice
                </span>
              )}
            </div>

            <div className="mt-3">
              {rawNotes ? (
                <p className="text-sm text-slate-700 font-medium leading-relaxed italic whitespace-pre-line">
                  &ldquo;{rawNotes}&rdquo;
                </p>
              ) : (
                <div className="flex items-center gap-2 text-slate-400 text-sm py-2">
                  <HelpCircle className="size-4 text-slate-300" />
                  <span>No special payment alerts or customer notes recorded.</span>
                </div>
              )}
            </div>
          </div>

          {/* Quick behavioral tip based on matching criteria */}
          <div className="mt-6 border-t border-slate-100/50 pt-4 text-xs">
            {paysLateHint ? (
              <div className="flex items-start gap-2 text-amber-800 font-medium">
                <AlertCircle className="size-4 text-amber-600 shrink-0 mt-0.5" />
                <span><strong>Billing tip:</strong> Ensure proactive invoice reminders and credit follow-ups are active for this account.</span>
              </div>
            ) : badCreditHint ? (
              <div className="flex items-start gap-2 text-rose-800 font-medium">
                <AlertCircle className="size-4 text-rose-600 shrink-0 mt-0.5" />
                <span><strong>Credit Hold:</strong> Consult management or accounts department before booking future work.</span>
              </div>
            ) : (
              <span className="text-slate-500">Regular account behavior. Normal booking operations apply.</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

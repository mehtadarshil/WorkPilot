'use client';

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { CircuitQuickAddTemplate, CircuitQuickAddTab } from '@/lib/electricalCertificates/circuitQuickAddTemplates';
import {
  CIRCUIT_QUICK_ADD_CATEGORY_COLORS,
  CIRCUIT_QUICK_ADD_CATEGORY_LABELS,
  CIRCUIT_QUICK_ADD_TABS,
  getQuickAddCategoriesForTab,
  getQuickAddTemplatesForTab,
} from '@/lib/electricalCertificates/circuitQuickAddTemplates';

export function CircuitQuickAddModal({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (template: CircuitQuickAddTemplate) => void;
}) {
  const [tab, setTab] = useState<CircuitQuickAddTab>('domestic');
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  const categories = useMemo(() => getQuickAddCategoriesForTab(tab), [tab]);
  const templatesByCategory = useMemo(() => {
    const map = new Map<string, CircuitQuickAddTemplate[]>();
    for (const category of categories) {
      map.set(
        category,
        getQuickAddTemplatesForTab(tab).filter((t) => t.category === category),
      );
    }
    return map;
  }, [tab, categories]);

  if (!open) return null;

  const handleSelect = (template: CircuitQuickAddTemplate) => {
    onSelect(template);
    setAddedIds((prev) => new Set(prev).add(template.id));
  };

  return (
    <>
      <button type="button" aria-label="Close" className="fixed inset-0 z-40 bg-slate-900/50" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 z-50 flex max-h-[min(88vh,720px)] w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h3 className="text-lg font-bold text-slate-900">Quick add</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="Close quick add"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
          {CIRCUIT_QUICK_ADD_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                tab === t.id
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === 'ultimate_london' ? (
            <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
              No custom presets configured yet. Use Domestic or Commercial presets, or add circuits manually with Add.
            </p>
          ) : (
            <div className="space-y-5">
              {categories.map((category) => {
                const items = templatesByCategory.get(category) ?? [];
                if (items.length === 0) return null;
                return (
                  <section key={category}>
                    <h4 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                      {CIRCUIT_QUICK_ADD_CATEGORY_LABELS[category]}
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {items.map((template) => {
                        const added = addedIds.has(template.id);
                        return (
                          <button
                            key={template.id}
                            type="button"
                            onClick={() => handleSelect(template)}
                            className={`min-w-[108px] rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-colors ${CIRCUIT_QUICK_ADD_CATEGORY_COLORS[category]} ${
                              added ? 'ring-2 ring-[#14B8A6] ring-offset-1' : ''
                            }`}
                          >
                            <span className="block leading-tight">{template.label}</span>
                            {template.subtitle && (
                              <span className="mt-0.5 block text-[10px] font-medium opacity-80">{template.subtitle}</span>
                            )}
                            {added && <span className="mt-1 block text-[10px] font-bold text-[#0d9488]">Added</span>}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          Tap a preset to append a circuit row with description, conductors, and protective device details pre-filled.
        </div>
      </div>
    </>
  );
}

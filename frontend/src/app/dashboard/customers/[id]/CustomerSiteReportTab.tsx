'use client';

/* eslint-disable @next/next/no-img-element -- blob previews for section images */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getJson, postJson, putJson, deleteRequest, getBlob } from '../../../apiClient';
import { Plus, Save, Printer, Download, ImagePlus, Loader2 } from 'lucide-react';
import dayjs from 'dayjs';
import type {
  SiteReportTemplateDefinition,
  SiteReportTemplateSection,
  TemplateSiteReportDocument,
  SiteReportSectionImageRow,
} from '@/lib/siteReportTemplateTypes';
import { IMAGE_MAX_BYTES, collectImageIds, newId, pdfFilenameFromTitle, readFileAsBase64 } from './customerSiteReportShared';
import {
  SiteReportFieldImageList,
  SiteReportSignatureBlock,
  renderSiteReportFieldInput,
} from './CustomerSiteReportFieldBlocks';

interface ReportPayload {
  id: number;
  customer_id: number;
  work_address_id: number | null;
  template_id: number;
  report_title: string | null;
  document: TemplateSiteReportDocument;
  updated_at: string;
  certificate_number?: string;
}

interface Props {
  customerId: string;
  workAddressId?: string;
  clientDisplayName: string;
  siteAddressLabel: string;
}

export default function CustomerSiteReportTab({
  customerId,
  workAddressId,
  clientDisplayName,
  siteAddressLabel,
}: Props) {
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [template, setTemplate] = useState<{ id: number; definition: SiteReportTemplateDefinition } | null>(null);
  const [reportTitle, setReportTitle] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [sectionImages, setSectionImages] = useState<Record<string, SiteReportSectionImageRow[]>>({});
  const [fieldImages, setFieldImages] = useState<Record<string, SiteReportSectionImageRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [signatureBusyFieldId, setSignatureBusyFieldId] = useState<string | null>(null);
  const imageUrlsRef = useRef<Map<number, string>>(new Map());

  const revokeAllImageUrls = useCallback(() => {
    for (const u of imageUrlsRef.current.values()) URL.revokeObjectURL(u);
    imageUrlsRef.current = new Map();
  }, []);

  const [urlTick, setUrlTick] = useState(0);
  const hydrateImageUrls = useCallback(
    async (doc: TemplateSiteReportDocument, reportId: number) => {
      if (!token) return;
      revokeAllImageUrls();
      const ids = collectImageIds(doc);
      await Promise.all(
        ids.map(async (imageId) => {
          try {
            const blob = await getBlob(
              `/customers/${customerId}/site-report/${reportId}/images/${imageId}/content`,
              token,
            );
            imageUrlsRef.current.set(imageId, URL.createObjectURL(blob));
          } catch {
            /* ignore */
          }
        }),
      );
      setUrlTick((t) => t + 1);
    },
    [customerId, token, revokeAllImageUrls],
  );

  const imageUrlFor = useCallback(
    (imageId: number) => {
      void urlTick;
      return imageUrlsRef.current.get(imageId) ?? '';
    },
    [urlTick],
  );

  const loadReport = useCallback(async () => {
    if (!token || !customerId) return;
    setLoading(true);
    setError(null);
    try {
      const qs = workAddressId ? `?work_address_id=${encodeURIComponent(workAddressId)}` : '';
      const res = await getJson<{ report: ReportPayload; template: { id: number; definition: SiteReportTemplateDefinition } }>(
        `/customers/${customerId}/site-report${qs}`,
        token,
      );
      setReport(res.report);
      setTemplate(res.template);
      const title = res.report.report_title?.trim();
      const defTitle = res.template.definition.report_title_default?.trim();
      setReportTitle(title || defTitle || '');
      setValues(res.report.document.values || {});
      setSectionImages(res.report.document.section_images || {});
      setFieldImages(res.report.document.field_images || {});
      await hydrateImageUrls(res.report.document, res.report.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load report');
      setReport(null);
      setTemplate(null);
    } finally {
      setLoading(false);
    }
  }, [customerId, workAddressId, token, hydrateImageUrls]);

  useEffect(() => {
    void loadReport();
    return () => revokeAllImageUrls();
  }, [loadReport, revokeAllImageUrls]);

  const persist = useCallback(
    async (
      nextValues: Record<string, string>,
      nextSectionImages: Record<string, SiteReportSectionImageRow[]>,
      nextFieldImages: Record<string, SiteReportSectionImageRow[]>,
      titleOverride?: string,
    ) => {
      if (!token || !report) throw new Error('Not ready');
      const title = titleOverride !== undefined ? titleOverride : reportTitle;
      const doc: TemplateSiteReportDocument = {
        mode: 'template_v1',
        template_id: report.template_id,
        values: nextValues,
        section_images: nextSectionImages,
        field_images: nextFieldImages,
      };
      const body = {
        report_id: report.id,
        work_address_id: workAddressId ? Number(workAddressId) : null,
        report_title: title.trim() ? title.trim().slice(0, 500) : null,
        document: doc,
      };
      const res = await putJson<{ report: ReportPayload; template: { id: number; definition: SiteReportTemplateDefinition } }>(
        `/customers/${customerId}/site-report`,
        body,
        token,
      );
      setReport(res.report);
      setTemplate(res.template);
      setValues(res.report.document.values || {});
      setSectionImages(res.report.document.section_images || {});
      setFieldImages(res.report.document.field_images || {});
      await hydrateImageUrls(res.report.document, res.report.id);
    },
    [token, report, reportTitle, customerId, workAddressId, hydrateImageUrls],
  );

  const handleSave = async () => {
    if (!token || !report) return;
    setSaving(true);
    setSaveOk(false);
    setError(null);
    try {
      await persist(values, sectionImages, fieldImages);
      setSaveOk(true);
      window.setTimeout(() => setSaveOk(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const setFieldValue = (id: string, v: string) => {
    setValues((prev) => ({ ...prev, [id]: v }));
  };

  const uploadSectionImage = async (sectionKey: string, file: File) => {
    if (!token || !report) return;
    if (file.size > IMAGE_MAX_BYTES) {
      setError(`Image is too large (max ${Math.round(IMAGE_MAX_BYTES / (1024 * 1024))} MB).`);
      return;
    }
    setUploadingKey(`${sectionKey}:${file.name}`);
    setError(null);
    try {
      const content_base64 = await readFileAsBase64(file);
      const res = await postJson<{ image: { id: number } }>(
        `/customers/${customerId}/site-report/${report.id}/images`,
        { filename: file.name, content_type: file.type || null, content_base64 },
        token,
      );
      const imageId = res.image.id;
      const row: SiteReportSectionImageRow = { id: newId(), image_id: imageId, description: '', note: '' };
      const next = {
        ...sectionImages,
        [sectionKey]: [...(sectionImages[sectionKey] || []), row],
      };
      await persist(values, next, fieldImages);
      try {
        const blob = await getBlob(
          `/customers/${customerId}/site-report/${report.id}/images/${imageId}/content`,
          token,
        );
        imageUrlsRef.current.set(imageId, URL.createObjectURL(blob));
        setUrlTick((t) => t + 1);
      } catch {
        /* ignore */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploadingKey(null);
    }
  };

  const removeSectionImage = async (sectionKey: string, row: SiteReportSectionImageRow) => {
    if (!token || !report) return;
    const nextList = (sectionImages[sectionKey] || []).filter((x) => x.id !== row.id);
    const next = { ...sectionImages, [sectionKey]: nextList };
    try {
      await persist(values, next, fieldImages);
      await deleteRequest(`/customers/${customerId}/site-report/${report.id}/images/${row.image_id}`, token);
      const u = imageUrlsRef.current.get(row.image_id);
      if (u) URL.revokeObjectURL(u);
      imageUrlsRef.current.delete(row.image_id);
      setUrlTick((t) => t + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove image');
    }
  };

  const updateImageMeta = (sectionKey: string, rowId: string, patch: Partial<SiteReportSectionImageRow>) => {
    setSectionImages((prev) => ({
      ...prev,
      [sectionKey]: (prev[sectionKey] || []).map((im) => (im.id === rowId ? { ...im, ...patch } : im)),
    }));
  };

  const updateFieldImageMeta = (fieldId: string, rowId: string, patch: Partial<SiteReportSectionImageRow>) => {
    setFieldImages((prev) => ({
      ...prev,
      [fieldId]: (prev[fieldId] || []).map((im) => (im.id === rowId ? { ...im, ...patch } : im)),
    }));
  };

  const uploadFieldImage = async (fieldId: string, file: File) => {
    if (!token || !report) return;
    if (file.size > IMAGE_MAX_BYTES) {
      setError(`Image is too large (max ${Math.round(IMAGE_MAX_BYTES / (1024 * 1024))} MB).`);
      return;
    }
    setUploadingKey(`field:${fieldId}`);
    setError(null);
    try {
      const content_base64 = await readFileAsBase64(file);
      const res = await postJson<{ image: { id: number } }>(
        `/customers/${customerId}/site-report/${report.id}/images`,
        { filename: file.name, content_type: file.type || null, content_base64 },
        token,
      );
      const imageId = res.image.id;
      const row: SiteReportSectionImageRow = { id: newId(), image_id: imageId, description: '', note: '' };
      const next = {
        ...fieldImages,
        [fieldId]: [...(fieldImages[fieldId] || []), row],
      };
      await persist(values, sectionImages, next);
      try {
        const blob = await getBlob(
          `/customers/${customerId}/site-report/${report.id}/images/${imageId}/content`,
          token,
        );
        imageUrlsRef.current.set(imageId, URL.createObjectURL(blob));
        setUrlTick((t) => t + 1);
      } catch {
        /* ignore */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploadingKey(null);
    }
  };

  const removeFieldImage = async (fieldId: string, row: SiteReportSectionImageRow) => {
    if (!token || !report) return;
    const nextList = (fieldImages[fieldId] || []).filter((x) => x.id !== row.id);
    const next = { ...fieldImages, [fieldId]: nextList };
    try {
      await persist(values, sectionImages, next);
      await deleteRequest(`/customers/${customerId}/site-report/${report.id}/images/${row.image_id}`, token);
      const u = imageUrlsRef.current.get(row.image_id);
      if (u) URL.revokeObjectURL(u);
      imageUrlsRef.current.delete(row.image_id);
      setUrlTick((t) => t + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove image');
    }
  };

  const replaceSignatureField = async (fieldId: string, blob: Blob) => {
    if (!token || !report) return;
    const file = new File([blob], 'signature.png', { type: 'image/png' });
    if (file.size > IMAGE_MAX_BYTES) {
      setError(`Signature file is too large (max ${Math.round(IMAGE_MAX_BYTES / (1024 * 1024))} MB).`);
      return;
    }
    setSignatureBusyFieldId(fieldId);
    setError(null);
    const prev = fieldImages[fieldId] || [];
    try {
      const content_base64 = await readFileAsBase64(file);
      const res = await postJson<{ image: { id: number } }>(
        `/customers/${customerId}/site-report/${report.id}/images`,
        { filename: file.name, content_type: file.type || 'image/png', content_base64 },
        token,
      );
      const imageId = res.image.id;
      const row: SiteReportSectionImageRow = {
        id: newId(),
        image_id: imageId,
        description: 'Signature',
        note: '',
      };
      const next = { ...fieldImages, [fieldId]: [row] };
      await persist(values, sectionImages, next);
      for (const old of prev) {
        if (old.image_id === imageId) continue;
        try {
          await deleteRequest(`/customers/${customerId}/site-report/${report.id}/images/${old.image_id}`, token);
        } catch {
          /* ignore */
        }
        const u = imageUrlsRef.current.get(old.image_id);
        if (u) URL.revokeObjectURL(u);
        imageUrlsRef.current.delete(old.image_id);
      }
      try {
        const b = await getBlob(`/customers/${customerId}/site-report/${report.id}/images/${imageId}/content`, token);
        imageUrlsRef.current.set(imageId, URL.createObjectURL(b));
        setUrlTick((t) => t + 1);
      } catch {
        /* ignore */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save signature');
    } finally {
      setSignatureBusyFieldId(null);
    }
  };

  const clearSignatureField = async (fieldId: string) => {
    if (!token || !report) return;
    const prev = fieldImages[fieldId] || [];
    if (prev.length === 0) return;
    setSignatureBusyFieldId(fieldId);
    setError(null);
    try {
      const next = { ...fieldImages, [fieldId]: [] };
      await persist(values, sectionImages, next);
      for (const old of prev) {
        try {
          await deleteRequest(`/customers/${customerId}/site-report/${report.id}/images/${old.image_id}`, token);
        } catch {
          /* ignore */
        }
        const u = imageUrlsRef.current.get(old.image_id);
        if (u) URL.revokeObjectURL(u);
        imageUrlsRef.current.delete(old.image_id);
      }
      setUrlTick((t) => t + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not clear signature');
    } finally {
      setSignatureBusyFieldId(null);
    }
  };

  const fetchReportPdfBlob = useCallback(async () => {
    if (!token || !report) throw new Error('Not signed in or report not loaded');
    return getBlob(`/customers/${encodeURIComponent(customerId)}/site-report/${report.id}/pdf`, token);
  }, [token, report, customerId]);

  const handleDownloadPdf = async () => {
    if (!report) return;
    setPdfBusy(true);
    setError(null);
    try {
      const blob = await fetchReportPdfBlob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = pdfFilenameFromTitle(printHeader.title);
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'PDF download failed');
    } finally {
      setPdfBusy(false);
    }
  };

  const handleOpenPdfForPrint = async () => {
    if (!report) return;
    setPdfBusy(true);
    setError(null);
    // window.open must run in the same synchronous turn as the click; after await the browser
    // treats a new window as an unsolicited popup and returns null (blocked).
    const w = window.open('about:blank', '_blank');
    if (!w) {
      setPdfBusy(false);
      setError('Pop-up blocked. Use Download PDF or allow pop-ups for this site.');
      return;
    }
    try {
      w.document.open();
      w.document.write(
        '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Print preview</title></head><body style="margin:0;font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#f8fafc;color:#64748b">Preparing PDF…</body></html>',
      );
      w.document.close();
    } catch {
      /* noop: rare noopener / policy edge cases */
    }
    try {
      const blob = await fetchReportPdfBlob();
      const objectUrl = URL.createObjectURL(blob);
      w.location.replace(objectUrl);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 120_000);
    } catch (e) {
      try {
        w.close();
      } catch {
        /* noop */
      }
      setError(e instanceof Error ? e.message : 'Could not open PDF');
    } finally {
      setPdfBusy(false);
    }
  };

  const printHeader = useMemo(
    () => ({
      client: clientDisplayName,
      site: siteAddressLabel,
      title: reportTitle.trim() || template?.definition.report_title_default?.trim() || 'Report',
    }),
    [clientDisplayName, siteAddressLabel, reportTitle, template?.definition.report_title_default],
  );

  const renderSection = (sec: SiteReportTemplateSection) => (
    <section
      key={sec.id}
      className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden print:shadow-none break-inside-avoid"
    >
      <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3">
        <h3 className="text-base font-bold text-slate-900">{sec.title}</h3>
        {sec.helper_text ? <p className="mt-1 text-xs text-slate-600">{sec.helper_text}</p> : null}
      </div>
      <div className="space-y-5 p-4">
        {sec.fields.map((field) => (
          <div key={field.id} className="space-y-1.5">
            {field.label ? <label className="block text-sm font-semibold text-slate-800">{field.label}</label> : null}
            {sec.id === 'client_header' && (field.id === 'client_name_display' || field.id === 'property_address_display') ? (
              <div className="rounded-lg border border-slate-100 bg-white px-3 py-2 text-sm text-slate-800 whitespace-pre-wrap">
                {field.id === 'client_name_display' ? clientDisplayName : siteAddressLabel}
              </div>
            ) : field.type === 'image' ? (
              <SiteReportFieldImageList
                rows={fieldImages[field.id] || []}
                imageUrlFor={imageUrlFor}
                uploading={uploadingKey === `field:${field.id}`}
                onPickFile={(f) => void uploadFieldImage(field.id, f)}
                onUpdateMeta={(rowId, patch) => updateFieldImageMeta(field.id, rowId, patch)}
                onRemove={(row) => void removeFieldImage(field.id, row)}
              />
            ) : field.type === 'signature' ? (
              <SiteReportSignatureBlock
                rows={fieldImages[field.id] || []}
                imageUrlFor={imageUrlFor}
                busy={signatureBusyFieldId === field.id}
                onSaveBlob={(blob) => void replaceSignatureField(field.id, blob)}
                onClearSaved={() => void clearSignatureField(field.id)}
              />
            ) : (
              renderSiteReportFieldInput(field, values[field.id] ?? '', (v) => setFieldValue(field.id, v))
            )}
          </div>
        ))}

        {sec.allow_section_images ? (
          <div className="border-t border-slate-100 pt-4 print:hidden">
            <p className="text-xs font-semibold uppercase text-slate-500 mb-2">Section images</p>
            <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              <ImagePlus className="size-3.5" />
              Add image
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={!!uploadingKey?.startsWith(sec.id)}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void uploadSectionImage(sec.id, f);
                }}
              />
            </label>
            {uploadingKey?.startsWith(sec.id) ? (
              <span className="ml-2 text-xs text-slate-500 inline-flex items-center gap-1">
                <Loader2 className="size-3.5 animate-spin" /> Uploading…
              </span>
            ) : null}
            <div className="mt-3 space-y-3">
              {(sectionImages[sec.id] || []).map((im) => {
                const src = imageUrlFor(im.image_id);
                return (
                  <div key={im.id} className="flex flex-wrap gap-3 rounded-lg border border-slate-100 p-3">
                    <div className="w-full sm:w-40 shrink-0">
                      {src ? (
                        <img src={src} alt="" className="w-full rounded-md border border-slate-100 object-contain max-h-36 bg-slate-50" />
                      ) : (
                        <div className="flex h-24 items-center justify-center rounded border border-dashed text-xs text-slate-400">No preview</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <input
                        value={im.description}
                        onChange={(e) => updateImageMeta(sec.id, im.id, { description: e.target.value })}
                        placeholder="What the image shows"
                        className="w-full rounded border border-slate-200 px-2 py-1 text-sm"
                      />
                      <input
                        value={im.note}
                        onChange={(e) => updateImageMeta(sec.id, im.id, { note: e.target.value })}
                        placeholder="Short note (optional)"
                        className="w-full rounded border border-slate-200 px-2 py-1 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => void removeSectionImage(sec.id, im)}
                        className="text-xs font-semibold text-rose-600 hover:underline print:hidden"
                      >
                        Remove image
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm font-medium text-slate-500">
        <Loader2 className="size-5 animate-spin" />
        Loading report…
      </div>
    );
  }

  if (!report || !template) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error || 'Could not load report.'}</div>
    );
  }

  const def = template.definition;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{def.report_title_default || 'Report'}</h2>
          {report.certificate_number ? (
            <p className="mt-0.5 text-sm font-medium text-slate-700">
              Certificate no. <span className="font-mono tracking-tight">{report.certificate_number}</span>
            </p>
          ) : null}
          <p className="text-sm text-slate-600 mt-0.5">
            Fields and layout come from your{' '}
            <span className="font-semibold text-slate-800">Settings → Reports</span> (Fire Risk Assessment is
            provided by default).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pdfBusy || !report}
            onClick={() => void handleDownloadPdf()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            {pdfBusy ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            Download PDF
          </button>
          <button
            type="button"
            disabled={pdfBusy || !report}
            onClick={() => void handleOpenPdfForPrint()}
            title="Opens a print-ready PDF in a new tab. Use the browser PDF viewer to print."
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            {pdfBusy ? <Loader2 className="size-4 animate-spin" /> : <Printer className="size-4" />}
            Print preview
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#14B8A6] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#119f8e] disabled:opacity-50"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Save
          </button>
        </div>
      </div>

      {error ? <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 print:hidden">{error}</div> : null}
      {saveOk ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 print:hidden">Saved.</div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm print:shadow-none print:border-slate-300">
        <div className="grid gap-3 text-sm">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Client</span>
            <p className="font-semibold text-slate-900">{printHeader.client}</p>
          </div>
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Property / site address</span>
            <p className="text-slate-800 whitespace-pre-wrap">{printHeader.site}</p>
          </div>
        </div>
        <label className="mt-4 block print:hidden">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Report title (print)</span>
          <input
            value={reportTitle}
            onChange={(e) => setReportTitle(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/30"
            placeholder={def.report_title_default || 'Report title'}
          />
        </label>
        <p className="mt-3 text-xs text-slate-500 print:hidden">Last updated {dayjs(report.updated_at).format('D MMM YYYY HH:mm')}</p>
      </div>

      <div className="space-y-8">{def.sections.map((sec) => renderSection(sec))}</div>

      {def.footer && def.footer.fields.length > 0 ? (
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden print:shadow-none break-inside-avoid">
          <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3">
            <h3 className="text-base font-bold text-slate-900">{def.footer.title || 'Footer'}</h3>
          </div>
          <div className="space-y-5 p-4">
            {def.footer.fields.map((field) => (
              <div key={field.id} className="space-y-1.5">
                {field.label ? <label className="block text-sm font-semibold text-slate-800">{field.label}</label> : null}
                {field.type === 'image' ? (
                  <SiteReportFieldImageList
                    rows={fieldImages[field.id] || []}
                    imageUrlFor={imageUrlFor}
                    uploading={uploadingKey === `field:${field.id}`}
                    onPickFile={(f) => void uploadFieldImage(field.id, f)}
                    onUpdateMeta={(rowId, patch) => updateFieldImageMeta(field.id, rowId, patch)}
                    onRemove={(row) => void removeFieldImage(field.id, row)}
                  />
                ) : field.type === 'signature' ? (
                  <SiteReportSignatureBlock
                    rows={fieldImages[field.id] || []}
                    imageUrlFor={imageUrlFor}
                    busy={signatureBusyFieldId === field.id}
                    onSaveBlob={(blob) => void replaceSignatureField(field.id, blob)}
                    onClearSaved={() => void clearSignatureField(field.id)}
                  />
                ) : (
                  renderSiteReportFieldInput(field, values[field.id] ?? '', (v) => setFieldValue(field.id, v))
                )}
              </div>
            ))}
            {def.footer.allow_section_images ? (
              <div className="border-t border-slate-100 pt-4 print:hidden">
                <p className="text-xs font-semibold uppercase text-slate-500 mb-2">Images (e.g. signature)</p>
                <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  <Plus className="size-3.5" />
                  Add image
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={!!uploadingKey?.startsWith('footer')}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (f) void uploadSectionImage('footer', f);
                    }}
                  />
                </label>
                <div className="mt-3 space-y-3">
                  {(sectionImages.footer || []).map((im) => {
                    const src = imageUrlFor(im.image_id);
                    return (
                      <div key={im.id} className="flex flex-wrap gap-3 rounded-lg border border-slate-100 p-3">
                        <div className="w-full sm:w-40 shrink-0">
                          {src ? (
                            <img src={src} alt="" className="w-full rounded-md border object-contain max-h-36 bg-slate-50" />
                          ) : null}
                        </div>
                        <div className="flex-1 space-y-2">
                          <input
                            value={im.description}
                            onChange={(e) => updateImageMeta('footer', im.id, { description: e.target.value })}
                            className="w-full rounded border px-2 py-1 text-sm"
                            placeholder="Description"
                          />
                          <input
                            value={im.note}
                            onChange={(e) => updateImageMeta('footer', im.id, { note: e.target.value })}
                            className="w-full rounded border px-2 py-1 text-sm"
                            placeholder="Note"
                          />
                          <button
                            type="button"
                            className="text-xs font-semibold text-rose-600"
                            onClick={() => void removeSectionImage('footer', im)}
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}

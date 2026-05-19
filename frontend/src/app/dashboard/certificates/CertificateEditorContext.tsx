'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { getJson, patchJson, postJson } from '../../apiClient';
import type { ElectricalCertificate, ElectricalCertificateDocument, ValidationIssue } from '@/lib/electricalCertificates/types';
import { validateElectricalCertificate } from '@/lib/electricalCertificates/validation';

type Ctx = {
  certificate: ElectricalCertificate;
  document: ElectricalCertificateDocument;
  setDocument: (updater: (prev: ElectricalCertificateDocument) => ElectricalCertificateDocument) => void;
  patchMeta: (patch: { job_number?: string; status?: ElectricalCertificate['status'] }) => Promise<void>;
  saveDocument: () => Promise<void>;
  saving: boolean;
  saveError: string | null;
  lastSavedAt: string | null;
  runValidate: () => Promise<ValidationIssue[]>;
  validationIssues: ValidationIssue[];
  validateOpen: boolean;
  setValidateOpen: (open: boolean) => void;
};

const CertificateEditorContext = createContext<Ctx | null>(null);

export function useCertificateEditor() {
  const ctx = useContext(CertificateEditorContext);
  if (!ctx) throw new Error('useCertificateEditor must be used within CertificateEditorProvider');
  return ctx;
}

export function CertificateEditorProvider({
  initial,
  children,
}: {
  initial: ElectricalCertificate;
  children: ReactNode;
}) {
  const token = typeof window !== 'undefined' ? window.localStorage.getItem('wp_token') : null;
  const [certificate, setCertificate] = useState(initial);
  const [document, setDocumentState] = useState(initial.document);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(initial.updated_at);
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([]);
  const [validateOpen, setValidateOpen] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const docRef = useRef(document);
  docRef.current = document;

  const setDocument = useCallback((updater: (prev: ElectricalCertificateDocument) => ElectricalCertificateDocument) => {
    setDocumentState((prev) => updater(prev));
  }, []);

  const saveDocument = useCallback(async () => {
    if (!token) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await patchJson<{ certificate: ElectricalCertificate }>(
        `/electrical-certificates/${certificate.id}`,
        { document: docRef.current },
        token,
      );
      setCertificate(res.certificate);
      setDocumentState(res.certificate.document);
      setLastSavedAt(res.certificate.updated_at);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [certificate.id, token]);

  useEffect(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void saveDocument();
    }, 1200);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [document, saveDocument]);

  const patchMeta = useCallback(
    async (patch: { job_number?: string; status?: ElectricalCertificate['status'] }) => {
      if (!token) return;
      const res = await patchJson<{ certificate: ElectricalCertificate }>(
        `/electrical-certificates/${certificate.id}`,
        patch,
        token,
      );
      setCertificate(res.certificate);
    },
    [certificate.id, token],
  );

  const runValidate = useCallback(async () => {
    const issues = validateElectricalCertificate(docRef.current);
    setValidationIssues(issues);
    if (token) {
      try {
        const res = await postJson<{ issues: ValidationIssue[] }>(
          `/electrical-certificates/${certificate.id}/validate`,
          {},
          token,
        );
        setValidationIssues(res.issues ?? issues);
        return res.issues ?? issues;
      } catch {
        /* use client validation */
      }
    }
    return issues;
  }, [certificate.id, token]);

  const value = useMemo(
    () => ({
      certificate,
      document,
      setDocument,
      patchMeta,
      saveDocument,
      saving,
      saveError,
      lastSavedAt,
      runValidate,
      validationIssues,
      validateOpen,
      setValidateOpen,
    }),
    [
      certificate,
      document,
      setDocument,
      patchMeta,
      saveDocument,
      saving,
      saveError,
      lastSavedAt,
      runValidate,
      validationIssues,
      validateOpen,
    ],
  );

  return <CertificateEditorContext.Provider value={value}>{children}</CertificateEditorContext.Provider>;
}

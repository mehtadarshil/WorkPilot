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

type CertificateEngineer = {
  id: number;
  full_name: string;
  role_position: string | null;
};

type AuthMeUser = {
  full_name?: string | null;
  email?: string | null;
  role?: string | null;
  officer_id?: number | null;
  officerId?: number | null;
};

type Ctx = {
  certificate: ElectricalCertificate;
  document: ElectricalCertificateDocument;
  setDocument: (updater: (prev: ElectricalCertificateDocument) => ElectricalCertificateDocument) => void;
  patchMeta: (patch: {
    customer_id?: number;
    work_address_id?: number | null;
    job_id?: number | null;
    job_number?: string;
    status?: ElectricalCertificate['status'];
  }) => Promise<void>;
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

  useEffect(() => {
    if (!token) return;
    void Promise.all([
      getJson<{ user: AuthMeUser }>('/auth/me', token),
      getJson<{ engineers: CertificateEngineer[] }>('/electrical-certificates/engineers', token).catch(() => ({ engineers: [] })),
    ])
      .then(([me, engineersRes]) => {
        const officerId = me.user.officer_id ?? me.user.officerId ?? null;
        const engineer = typeof officerId === 'number' ? engineersRes.engineers.find((item) => item.id === officerId) : null;
        const name = engineer?.full_name || me.user.full_name || me.user.email || '';
        const position = engineer?.role_position || (me.user.role === 'ADMIN' ? 'Authorised person' : me.user.role || '');
        if (!name) return;
        const today = new Date().toISOString().slice(0, 10);

        setDocumentState((prev) => {
          let changed = false;
          const next: ElectricalCertificateDocument = {
            ...prev,
            installation: {
              ...prev.installation,
              inspectedBy: prev.installation.inspectedBy.trim() || name,
              inspectedPosition: prev.installation.inspectedPosition.trim() || position,
              inspectedDate: prev.installation.inspectedDate || today,
              authorisedBy: prev.installation.authorisedBy.trim() || name,
              authorisedPosition: prev.installation.authorisedPosition.trim() || position,
              authorisedDate: prev.installation.authorisedDate || today,
            },
          };
          changed =
            next.installation.inspectedBy !== prev.installation.inspectedBy ||
            next.installation.inspectedPosition !== prev.installation.inspectedPosition ||
            next.installation.inspectedDate !== prev.installation.inspectedDate ||
            next.installation.authorisedBy !== prev.installation.authorisedBy ||
            next.installation.authorisedPosition !== prev.installation.authorisedPosition ||
            next.installation.authorisedDate !== prev.installation.authorisedDate;

          if (prev.fireAlarm) {
            next.fireAlarm = {
              ...prev.fireAlarm,
              declaration: {
                ...prev.fireAlarm.declaration,
                inspectedBy: prev.fireAlarm.declaration.inspectedBy.trim() || name,
                inspectedPosition: prev.fireAlarm.declaration.inspectedPosition.trim() || position,
                inspectionDate: prev.fireAlarm.declaration.inspectionDate || today,
                authorisedBy: prev.fireAlarm.declaration.authorisedBy.trim() || name,
                authorisedPosition: prev.fireAlarm.declaration.authorisedPosition.trim() || position,
                authorisedDate: prev.fireAlarm.declaration.authorisedDate || today,
              },
            };
            changed =
              changed ||
              next.fireAlarm.declaration.inspectedBy !== prev.fireAlarm.declaration.inspectedBy ||
              next.fireAlarm.declaration.inspectedPosition !== prev.fireAlarm.declaration.inspectedPosition ||
              next.fireAlarm.declaration.inspectionDate !== prev.fireAlarm.declaration.inspectionDate ||
              next.fireAlarm.declaration.authorisedBy !== prev.fireAlarm.declaration.authorisedBy ||
              next.fireAlarm.declaration.authorisedPosition !== prev.fireAlarm.declaration.authorisedPosition ||
              next.fireAlarm.declaration.authorisedDate !== prev.fireAlarm.declaration.authorisedDate;
          }

          if (prev.domesticFireAlarm) {
            next.domesticFireAlarm = {
              ...prev.domesticFireAlarm,
              declaration: {
                ...prev.domesticFireAlarm.declaration,
                inspectedBy: prev.domesticFireAlarm.declaration.inspectedBy.trim() || name,
                inspectedPosition: prev.domesticFireAlarm.declaration.inspectedPosition.trim() || position,
                inspectionDate: prev.domesticFireAlarm.declaration.inspectionDate || today,
                authorisedBy: prev.domesticFireAlarm.declaration.authorisedBy.trim() || name,
                authorisedPosition: prev.domesticFireAlarm.declaration.authorisedPosition.trim() || position,
                authorisedDate: prev.domesticFireAlarm.declaration.authorisedDate || today,
              },
            };
            changed =
              changed ||
              next.domesticFireAlarm.declaration.inspectedBy !== prev.domesticFireAlarm.declaration.inspectedBy ||
              next.domesticFireAlarm.declaration.inspectedPosition !== prev.domesticFireAlarm.declaration.inspectedPosition ||
              next.domesticFireAlarm.declaration.inspectionDate !== prev.domesticFireAlarm.declaration.inspectionDate ||
              next.domesticFireAlarm.declaration.authorisedBy !== prev.domesticFireAlarm.declaration.authorisedBy ||
              next.domesticFireAlarm.declaration.authorisedPosition !== prev.domesticFireAlarm.declaration.authorisedPosition ||
              next.domesticFireAlarm.declaration.authorisedDate !== prev.domesticFireAlarm.declaration.authorisedDate;
          }

          if (prev.domesticFireAlarmInst) {
            next.domesticFireAlarmInst = {
              ...prev.domesticFireAlarmInst,
              declaration: {
                ...prev.domesticFireAlarmInst.declaration,
                installedBy: prev.domesticFireAlarmInst.declaration.installedBy.trim() || name,
                installedPosition: prev.domesticFireAlarmInst.declaration.installedPosition.trim() || position,
                installedDate: prev.domesticFireAlarmInst.declaration.installedDate || today,
                authorisedBy: prev.domesticFireAlarmInst.declaration.authorisedBy.trim() || name,
                authorisedPosition: prev.domesticFireAlarmInst.declaration.authorisedPosition.trim() || position,
                authorisedDate: prev.domesticFireAlarmInst.declaration.authorisedDate || today,
              },
            };
            changed =
              changed ||
              next.domesticFireAlarmInst.declaration.installedBy !== prev.domesticFireAlarmInst.declaration.installedBy ||
              next.domesticFireAlarmInst.declaration.installedPosition !== prev.domesticFireAlarmInst.declaration.installedPosition ||
              next.domesticFireAlarmInst.declaration.installedDate !== prev.domesticFireAlarmInst.declaration.installedDate ||
              next.domesticFireAlarmInst.declaration.authorisedBy !== prev.domesticFireAlarmInst.declaration.authorisedBy ||
              next.domesticFireAlarmInst.declaration.authorisedPosition !== prev.domesticFireAlarmInst.declaration.authorisedPosition ||
              next.domesticFireAlarmInst.declaration.authorisedDate !== prev.domesticFireAlarmInst.declaration.authorisedDate;
          }

          if (prev.fireExtinguisher) {
            next.fireExtinguisher = {
              ...prev.fireExtinguisher,
              declaration: {
                ...prev.fireExtinguisher.declaration,
                inspectedBy: prev.fireExtinguisher.declaration.inspectedBy.trim() || name,
                inspectedPosition: prev.fireExtinguisher.declaration.inspectedPosition.trim() || position,
                inspectedDate: prev.fireExtinguisher.declaration.inspectedDate || today,
                authorisedBy: prev.fireExtinguisher.declaration.authorisedBy.trim() || name,
                authorisedPosition: prev.fireExtinguisher.declaration.authorisedPosition.trim() || position,
                authorisedDate: prev.fireExtinguisher.declaration.authorisedDate || today,
              },
            };
            changed =
              changed ||
              next.fireExtinguisher.declaration.inspectedBy !== prev.fireExtinguisher.declaration.inspectedBy ||
              next.fireExtinguisher.declaration.inspectedPosition !== prev.fireExtinguisher.declaration.inspectedPosition ||
              next.fireExtinguisher.declaration.inspectedDate !== prev.fireExtinguisher.declaration.inspectedDate ||
              next.fireExtinguisher.declaration.authorisedBy !== prev.fireExtinguisher.declaration.authorisedBy ||
              next.fireExtinguisher.declaration.authorisedPosition !== prev.fireExtinguisher.declaration.authorisedPosition ||
              next.fireExtinguisher.declaration.authorisedDate !== prev.fireExtinguisher.declaration.authorisedDate;
          }

          if (prev.emergencyLighting) {
            next.emergencyLighting = {
              ...prev.emergencyLighting,
              declaration: {
                ...prev.emergencyLighting.declaration,
                inspectedBy: prev.emergencyLighting.declaration.inspectedBy.trim() || name,
                inspectedPosition: prev.emergencyLighting.declaration.inspectedPosition.trim() || position,
                inspectedDate: prev.emergencyLighting.declaration.inspectedDate || today,
                authorisedBy: prev.emergencyLighting.declaration.authorisedBy.trim() || name,
                authorisedPosition: prev.emergencyLighting.declaration.authorisedPosition.trim() || position,
                authorisedDate: prev.emergencyLighting.declaration.authorisedDate || today,
              },
            };
            changed =
              changed ||
              next.emergencyLighting.declaration.inspectedBy !== prev.emergencyLighting.declaration.inspectedBy ||
              next.emergencyLighting.declaration.inspectedPosition !== prev.emergencyLighting.declaration.inspectedPosition ||
              next.emergencyLighting.declaration.inspectedDate !== prev.emergencyLighting.declaration.inspectedDate ||
              next.emergencyLighting.declaration.authorisedBy !== prev.emergencyLighting.declaration.authorisedBy ||
              next.emergencyLighting.declaration.authorisedPosition !== prev.emergencyLighting.declaration.authorisedPosition ||
              next.emergencyLighting.declaration.authorisedDate !== prev.emergencyLighting.declaration.authorisedDate;
          }

          if (prev.electricalInstallation) {
            next.electricalInstallation = {
              ...prev.electricalInstallation,
              design: {
                ...prev.electricalInstallation.design,
                designer1: {
                  ...prev.electricalInstallation.design.designer1,
                  name: prev.electricalInstallation.design.designer1.name.trim() || name,
                  signature: prev.electricalInstallation.design.designer1.signature.trim() || name,
                  date: prev.electricalInstallation.design.designer1.date || today,
                },
              },
              construction: {
                ...prev.electricalInstallation.construction,
                constructorSignatory: {
                  ...prev.electricalInstallation.construction.constructorSignatory,
                  name: prev.electricalInstallation.construction.constructorSignatory.name.trim() || name,
                  signature: prev.electricalInstallation.construction.constructorSignatory.signature.trim() || name,
                  date: prev.electricalInstallation.construction.constructorSignatory.date || today,
                },
              },
              inspection: {
                ...prev.electricalInstallation.inspection,
                inspector: {
                  ...prev.electricalInstallation.inspection.inspector,
                  name: prev.electricalInstallation.inspection.inspector.name.trim() || name,
                  signature: prev.electricalInstallation.inspection.inspector.signature.trim() || name,
                  date: prev.electricalInstallation.inspection.inspector.date || today,
                },
              },
            };
            changed = true;
          }

          return changed ? next : prev;
        });
      })
      .catch(() => {
        // Sign-off defaults are a convenience; certificate editing still works without them.
      });
  }, [token]);

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
    async (patch: {
      customer_id?: number;
      work_address_id?: number | null;
      job_id?: number | null;
      job_number?: string;
      status?: ElectricalCertificate['status'];
    }) => {
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

'use client';

import type { ReactNode } from 'react';
import AuthenticatedDiaryFilePreview from './AuthenticatedDiaryFilePreview';
import {
  contentTypeFromJobReportAnswer,
  isJobReportAnswerDataUrl,
  isJobReportAnswerFilePath,
  isJobReportMediaAnswer,
} from './jobReportAnswerMedia';

export function JobReportAnswerValue({
  questionType,
  raw,
  token,
}: {
  questionType: string;
  raw: string | undefined;
  token: string | null;
}): ReactNode {
  const v = raw?.trim() ?? '';
  if (!v) return <span className="text-slate-400 italic text-sm">No answer</span>;

  if (isJobReportMediaAnswer(questionType, v)) {
    if (isJobReportAnswerDataUrl(v)) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={v} alt="" className="max-h-52 rounded-md border border-slate-200 bg-white object-contain" />
      );
    }
    if (isJobReportAnswerFilePath(v) && token) {
      return (
        <AuthenticatedDiaryFilePreview
          filePath={v}
          contentType={contentTypeFromJobReportAnswer(v)}
          kind="image"
          token={token}
        />
      );
    }
    return <span className="text-slate-400 italic text-sm">Image unavailable</span>;
  }

  if (questionType === 'textarea') {
    return (
      <pre className="whitespace-pre-wrap rounded-md border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-800">
        {v}
      </pre>
    );
  }

  return <p className="text-sm text-slate-800">{v}</p>;
}

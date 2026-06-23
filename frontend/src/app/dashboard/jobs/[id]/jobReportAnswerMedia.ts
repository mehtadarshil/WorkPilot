const JOB_REPORT_ANSWER_FILE_PATH =
  /^\/diary-events\/\d+\/job-report-answers\/\d+\/files\//;

export function isJobReportAnswerFilePath(value: string): boolean {
  return JOB_REPORT_ANSWER_FILE_PATH.test(value.trim());
}

export function isJobReportAnswerDataUrl(value: string): boolean {
  return value.trim().startsWith('data:image');
}

export function isJobReportMediaAnswer(questionType: string, raw: string | undefined): boolean {
  const v = raw?.trim() ?? '';
  if (!v) return false;
  return (
    questionType === 'customer_signature' ||
    questionType === 'officer_signature' ||
    questionType === 'before_photo' ||
    questionType === 'after_photo' ||
    isJobReportAnswerDataUrl(v) ||
    isJobReportAnswerFilePath(v)
  );
}

export function contentTypeFromJobReportAnswer(value: string): string {
  const v = value.trim();
  if (v.startsWith('data:image/png')) return 'image/png';
  if (v.startsWith('data:image/webp')) return 'image/webp';
  if (v.startsWith('data:image/gif')) return 'image/gif';
  const lower = v.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'image/jpeg';
}

export function hasJobReportSignatureAnswer(
  questions: Array<{ id: number; question_type: string }>,
  answers: Record<string, string>,
): boolean {
  return questions.some((q) => {
    if (q.question_type !== 'customer_signature' && q.question_type !== 'officer_signature') {
      return false;
    }
    return isJobReportMediaAnswer(q.question_type, answers[String(q.id)]);
  });
}

import type { WeeklyTimetable } from './types';

export function maskPersonalInfo(text: string): string {
  let masked = text.replace(/01[0-9]-?(\d{3,4})-?(\d{4})/g, '010-****-$2');
  masked = masked.replace(/(\d{6})-?[1-4]\d{6}/g, '$1-*******');
  return masked;
}

export interface ParsedItem {
  title: string;
  type: '고정' | '마감' | '시작가능' | '미정' | '확인만';
  date: string | null;
  time?: string | null;
  endTime?: string | null;
  place?: string | null;
  category: '생기부' | '평가' | '행정' | '연수' | '상담' | '회의' | '수업' | '행사' | '기타';
  isMine: boolean;
  mineReason?: string;
  needsDate?: boolean;
  overdue?: boolean;
  movable?: boolean;
  steps?: string[];
  linkedTo?: string | null;
  note?: string | null;
  originalText?: string;
  confidence?: 'high' | 'low';
}

export interface ParseResultData {
  kind: '공문' | '업무지시' | '시간표' | '판단불가';
  items: ParsedItem[];
  timetable?: WeeklyTimetable | null;
  ignored: { text: string; reason: string }[];
  note?: string | null;
}

/**
 * Gemini 파싱 요청을 서버 프록시(/api/gemini)로 전달합니다.
 * API 키는 서버에만 보관되어 브라우저에 노출되지 않습니다.
 */
export async function parseTeacherInboxWithGemini(params: {
  imageFileBase64?: string;
  mimeType?: string;
  textContent?: string;
  teacherContext?: {
    today?: string;
    subject?: string;
    duty?: string;
    timetableText?: string;
  };
}): Promise<ParseResultData> {
  const response = await fetch('/api/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageFileBase64: params.imageFileBase64,
      mimeType: params.mimeType || 'image/png',
      textContent: params.textContent,
      teacherContext: params.teacherContext,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error(err.error || `AI 분석 실패 (${response.status})`);
  }

  return response.json() as Promise<ParseResultData>;
}

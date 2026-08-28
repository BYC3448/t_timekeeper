/**
 * Upstage Document Parse — 서버 프록시(/api/upstage)를 통해 호출합니다.
 * API 키는 서버에만 보관되어 브라우저에 노출되지 않습니다.
 */
export async function parseDocumentWithUpstage(params: {
  fileBase64: string; // data URL (base64)
  fileName: string;
}): Promise<string> {
  const { fileBase64, fileName } = params;

  // data URL에서 순수 base64와 mimeType 분리
  const hasDataPrefix = fileBase64.includes(',');
  const pureBase64 = hasDataPrefix ? fileBase64.split(',')[1] : fileBase64;
  const mimeType = hasDataPrefix
    ? fileBase64.split(';')[0].split(':')[1]
    : 'application/octet-stream';

  const response = await fetch('/api/upstage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileBase64: pureBase64, mimeType, fileName }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error(err.error || 'Upstage 문서 파싱 실패');
  }

  const data = await response.json();
  if (!data.text) throw new Error('Upstage가 문서 내용을 추출하지 못했습니다.');
  return data.text;
}

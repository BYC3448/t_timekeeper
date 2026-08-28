import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.UPSTAGE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'UPSTAGE_API_KEY가 서버에 설정되지 않았습니다.' });
  }

  const { fileBase64, mimeType = 'application/octet-stream', fileName = 'document.hwp' } = req.body || {};
  if (!fileBase64) {
    return res.status(400).json({ error: 'fileBase64가 필요합니다.' });
  }

  try {
    const buffer = Buffer.from(fileBase64, 'base64');
    const blob = new Blob([buffer], { type: mimeType });

    const formData = new FormData();
    formData.append('document', blob, fileName);
    formData.append('model', 'document-parse');

    const response = await fetch('https://api.upstage.ai/v1/document-digitization', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const detail = err?.detail || err?.message || err?.error?.message || JSON.stringify(err);
      throw new Error(`Upstage 오류 (HTTP ${response.status}): ${detail}`);
    }

    const data = await response.json();
    const text = data?.content?.markdown || data?.content?.text || data?.content?.html;
    if (!text) {
      throw new Error(`Upstage가 문서 내용을 추출하지 못했습니다. (응답 키: ${JSON.stringify(Object.keys(data || {}))}, content 키: ${JSON.stringify(Object.keys(data?.content || {}))})`);
    }

    return res.json({ text });
  } catch (err: any) {
    console.error('[api/upstage] 오류:', err);
    return res.status(500).json({ error: err.message || 'Upstage API 호출 실패' });
  }
}

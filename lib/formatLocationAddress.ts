/**
 * Google 等の長文住所から国名・郵便番号を除き、都道府県〜の短い表記にする。
 * 例: 「日本、〒150-0002 東京都渋谷区…」→「東京都渋谷区…」
 */
export function compactLocationAddress(raw: string): string {
  const input = String(raw || '').trim();
  if (!input) return '';

  // 「施設名 · 住所」形式は各パートを個別に整形
  const segments = input.split(/\s*[·•]\s*/u);
  if (segments.length > 1) {
    const compacted = segments
      .map((part) => compactAddressSegment(part.trim()))
      .filter(Boolean);
    // 施設名と住所が同一になった場合は重複を除去
    const unique: string[] = [];
    for (const part of compacted) {
      if (!unique.some((u) => u === part)) unique.push(part);
    }
    return unique.join(' · ');
  }

  return compactAddressSegment(input);
}

function compactAddressSegment(raw: string): string {
  let s = raw.trim();
  if (!s) return '';

  // 国名（先頭・末尾）
  s = s.replace(/^日本[、,，\s]+/u, '');
  s = s.replace(/[、,，\s]+日本$/u, '');
  s = s.replace(/^Japan\s*[,，]?\s+/iu, '');
  s = s.replace(/[,，\s]+Japan$/iu, '');

  // 郵便番号（〒付き / 先頭の xxx-xxxx）
  s = s.replace(/〒\s*\d{3}[-−–]?\d{4}\s*/gu, '');
  s = s.replace(/^\d{3}[-−–]\d{4}\s+/u, '');
  // 英語住所末尾付近の郵便番号（例: Tokyo 150-0002）
  s = s.replace(/\s+\d{3}[-−–]\d{4}(?=\s*[,，]|\s*$)/u, '');

  // 余分な区切り・空白
  s = s.replace(/^[、,，\s]+/u, '');
  s = s.replace(/[、,，\s]+$/u, '');
  s = s.replace(/\s{2,}/gu, ' ').trim();
  return s;
}

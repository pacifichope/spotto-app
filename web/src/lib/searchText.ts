/** 比較用に正規化（NFKC・小文字・カタカナ→ひらがな・空白除去） */
export function normalizeSearchText(input: string): string {
  const nfkc = input.normalize('NFKC').toLowerCase();
  const hira = nfkc.replace(/[\u30a1-\u30f6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60),
  );
  return hira.replace(/[\s\u3000]+/g, '');
}

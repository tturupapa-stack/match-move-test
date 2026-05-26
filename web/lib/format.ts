// UI 공통 포맷 헬퍼. 서버 lib/message-builder의 formatStadium과 동일 규칙.

/**
 * '구리 아천 스타디움' + '1구장' → '구리 아천 스타디움 1구장'
 * fieldName이 없거나 빈 문자열이면 stadium만 반환.
 * stadium이 이미 면 이름을 suffix로 포함하는 경우 중복 방지.
 */
export function formatStadium(
  stadiumName: string | null | undefined,
  fieldName: string | null | undefined,
): string {
  const s = (stadiumName ?? '').trim();
  const f = (fieldName ?? '').trim();
  if (!f) return s;
  if (!s) return f;
  if (s.endsWith(f)) return s;
  return `${s} ${f}`;
}

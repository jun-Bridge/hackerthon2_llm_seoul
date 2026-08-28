// 백엔드 정본과 1:1로 맞춘 상수. 여기가 프론트의 단일 출처다.
// 정본: docs/api-contract.md 공통 타입, .kiro requirements.md Category Taxonomy.
// 카테고리 문구가 백엔드와 한 글자라도 다르면 category 필터/분류 매칭이 깨진다.

// 카테고리 8종 (백엔드 llm/choices.CATEGORIES와 정확히 일치)
export const CATEGORIES = [
  "냉난방 / 공조",
  "위생 / 배관",
  "전기 / 설비",
  "통신 / 인터넷",
  "영상 / 기자재",
  "공간 / 편의",
  "안전 / 보안",
  "기타",
];

// 게시판 카테고리 탭에 쓸 짧은 라벨 (표시용). 값은 위 정본 그대로 보낸다.
export const CATEGORY_SHORT = {
  "냉난방 / 공조": "냉난방",
  "위생 / 배관": "위생/배관",
  "전기 / 설비": "전기",
  "통신 / 인터넷": "통신",
  "영상 / 기자재": "기자재",
  "공간 / 편의": "공간",
  "안전 / 보안": "안전",
  "기타": "기타",
};

// 민원 상태 7종 (백엔드 Status)
export const STATUSES = [
  "미확인", "확인", "처리중", "해결완료", "보류", "거절", "철회",
];

// 역할 (백엔드 role) — 'staff' 아님. 관리자는 'admin'.
export const ROLE = { STUDENT: "student", ADMIN: "admin" };

// created_at(ISO 8601) → "YYYY.MM.DD" 표시용
export function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
}

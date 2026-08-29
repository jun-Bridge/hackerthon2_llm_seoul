# store/ — 전역 상태

- `AppContext.jsx` — 로그인 사용자(`user`), 민원 목록(`complaints`), 관리자 통계(`stats`).
- `constants.js` — 카테고리 8종·상태 7종·`formatDate`. **백엔드 정본과 문자열까지 같아야 한다**
  (`app/llm/choices.py`, `app/schemas/complaint.py`). 한 글자만 달라도 필터·분류 매칭이 깨진다.

## 여기가 흡수하는 것

**필드명 차이.** 화면 컴포넌트들이 `timestamp`·`rawText`로 읽는데 서버 정본은
`created_at`·`body`다. `normalize()`가 원본을 유지한 채 별칭을 덧붙여, 페이지를
하나하나 고치지 않아도 되게 한다.

**전이별 엔드포인트 분기.** 화면은 `changeStatus(id, '보류', reason)` 하나로 부르지만
백엔드는 accept/resolve/hold/reject가 따로 있고 각자 선행 상태를 `WHERE`로 검증한다.

## 여기가 하지 않는 것

**실패를 가리지 않는다.** API가 실패하거나 목록이 비어도 데모 데이터로 대체하지 않는다.
그렇게 하면 빈 게시판과 장애가 화면에서 같아 보이고, 연동이 끊긴 것도 눈치채지 못한다.

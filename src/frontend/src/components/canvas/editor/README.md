# canvas/editor/ — 본문 편집기

구현 예정
- `DocumentEditor.tsx` — 문서 본문 편집. 로컬 편집 상태 관리, 저장 시점 결정
- `SelectionToolbar.tsx` — 텍스트 선택 시 뜨는 액션 바("다시 써줘"·"짧게"·"직접 지시")
- `InstructionPopover.tsx` — 선택 영역에 줄 지시문 입력
- `PendingEditOverlay.tsx` — LLM 응답 대기 중 해당 구간 표시

선택 범위(offset)를 백엔드에 그대로 넘긴다 — 백엔드가 원문 기준으로 부분 치환한다.

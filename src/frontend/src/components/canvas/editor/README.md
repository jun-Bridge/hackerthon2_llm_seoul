# canvas/editor/ — 본문 편집기

구현 예정
- `DocumentEditor.tsx` — 마크다운 본문 편집. 블록 단위 렌더·편집
- `Block.tsx` — 블록 하나. 포커스·편집·선택
- `LockOverlay.tsx` — **LLM 작업 중 블러 + 입력 차단.** 잠금 해제 시 걷힌다
- `useBlockEdit.ts` 연동 — 편집 반영 요청, 409(잠금 충돌) 처리

블록은 id로 다룬다. 인덱스나 문자 위치로 가리키지 않는다.

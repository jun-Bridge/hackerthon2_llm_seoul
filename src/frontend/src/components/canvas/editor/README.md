# canvas/editor/ — 본문 편집기

구현 예정
- `DocumentEditor.tsx` — 마크다운 본문 편집. 블록 단위 렌더·편집
- `Block.tsx` — 블록 하나. 포커스·편집·선택
- `DiffView.tsx` — **LLM 제안 diff.** 추가된 줄 `+`, 삭제된 줄 `−`로 구분 표시
- `ProposalBar.tsx` — **적용 / 취소** 버튼. 취소 시 사유를 짧게 남길 수 있다(다음 턴 LLM에 전달)
- `LockOverlay.tsx` — LLM 작업 중·제안 대기 중 블러 + 입력 차단. 클라이언트 타임아웃 포함
- `useBlockEdit.ts` 연동 — 편집 반영 요청, 409(잠금 충돌) 처리

블록은 id로 다룬다. 인덱스나 문자 위치로 가리키지 않는다.

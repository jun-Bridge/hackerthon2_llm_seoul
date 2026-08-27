# hooks/ — 커스텀 훅

구현 예정
- `useChatStream.ts` — SSE 구독 수명주기, 토큰 누적, 중단·재연결
- `useDocument.ts` — 문서 로드·저장·버전 목록
- `useSelection.ts` — 편집기 내 텍스트 선택 범위 추적
- `useDebounce.ts` — 자동 저장 지연

컴포넌트에서 `useEffect`로 직접 통신하지 말고 여기로 뺀다.

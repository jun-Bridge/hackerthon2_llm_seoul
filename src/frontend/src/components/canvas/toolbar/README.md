# canvas/toolbar/ — 문서 작업

구현 예정
- `DocumentToolbar.tsx` — 작업 버튼 모음
- `DownloadButton.tsx` — 현재 문서를 `.md`로 저장
- `ClipboardActions.tsx` — 복사·잘라내기·붙여넣기 (블록/선택 단위)
- `UndoRedo.tsx` — 실행취소·다시실행
- `FormatButtons.tsx` — **일괄 서식.** "서식 제거"/"서식 적용" 버튼. 누르면 LLM이 문서 전체를 읽고 고친다. 진행 중에는 캔버스가 잠기고 블러 처리된다 (일반 LLM 편집과 동일)

잠금 중에는 편집성 작업이 비활성화된다. 복사·다운로드는 잠금 중에도 된다.

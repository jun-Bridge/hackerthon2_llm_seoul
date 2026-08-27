# schemas/ — API 계약 (Pydantic)

HTTP 경계를 넘는 모든 타입. ORM 모델과 **분리**한다 — DB 스키마 변경이 API 계약을 자동으로 깨지 않게.

구현 예정
- `chat.py` — `ChatRequest` · `ChatResponse` · `StreamChunk`
- `document.py` — `DocumentCreate` · `DocumentRead` · `VersionRead` · `SelectionEditRequest`(문서 id, 선택 범위, 지시문)
- `common.py` — 페이지네이션, 에러 응답 형태

프론트의 `src/frontend/src/types/`가 이 정의와 짝을 이룬다. 한쪽을 고치면 다른 쪽도 고친다.

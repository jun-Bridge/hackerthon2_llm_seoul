# llm/tools/ — 캔버스 도구 정의

LLM에 노출되는 함수. **LLM은 문서를 컨텍스트에 소유하지 않고, 필요할 때 호출해 읽는다.**
그리고 **직접 쓰지 못한다** — 쓰기 도구는 제안을 쌓을 뿐이고, 반영은 사용자 승인이 한다.

구현 예정
- `schema.py` — 도구 JSON 스키마 (LLM에 전달할 정의)
  - 읽기(즉시): `read_document()` · `list_attachments()`
  - 쓰기(제안만): `propose_replace_line` · `propose_insert_lines` · `propose_delete_lines` · `propose_replace_document` · `propose_insert_image`
- `executor.py` — tool call 파싱 → `document/service.py` 위임 → 결과를 LLM에 반환
  - 쓰기 도구의 반환값은 "제안에 담겼다"이지 "반영됐다"가 아니다. 프롬프트에서도 이 구분을 분명히 한다.
  - 잘못된 `block_id` 등 오류는 예외로 터뜨리지 않고 **오류 결과를 LLM에 돌려준다**(LLM이 스스로 고치게)

**LLM은 이미지를 보지 못한다.** 텍스트 모델이므로 파일명과 사용자가 붙인 설명(`user_note`)만으로
배치 위치를 판단한다. 배치가 어긋날 수 있고, 그래서 제안·승인 구조가 더 중요하다.

일괄 서식 버튼도 같은 경로를 쓴다 — `read_document()` → 변환 → `propose_replace_document()`.
직전 제안의 적용/거절 여부는 다음 턴 컨텍스트에 들어간다(대화 코어가 기록).

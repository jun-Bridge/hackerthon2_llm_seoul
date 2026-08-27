# llm/tools/ — 캔버스 도구 정의

LLM에 노출되는 함수. **LLM은 문서를 컨텍스트에 소유하지 않고, 필요할 때 호출해 읽는다.**

구현 예정
- `schema.py` — 도구 JSON 스키마 (LLM에 전달할 정의)
  - `read_document()` → `[{id, order, content}]`
  - `write_block(block_id, content)`
  - `insert_block(after_block_id | null, content)`
  - `delete_block(block_id)`
  - `replace_document(blocks[])`
  - 일괄 서식 버튼도 같은 도구를 쓴다 — `read_document()` → 변환 → `replace_document()`
- `executor.py` — tool call 파싱 → `document/service.py` 위임 → 결과를 LLM에 반환.
  잘못된 `block_id` 등 오류는 예외로 터뜨리지 않고 **오류 결과를 LLM에 돌려준다**(LLM이 스스로 고치게).

쓰기 도구가 처음 호출되는 순간 문서 잠금이 걸린다. 읽기는 잠그지 않는다.

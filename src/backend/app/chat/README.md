# chat/ — 대화 코어 (세션 컨테이너)

**상주하지 않는다.** 요청마다 컨테이너를 만들고 Redis에서 상태를 복원한다.

구현 예정
- `container.py` — 세션 컨테이너
  - Redis에서 복원: 최근 메시지 버퍼 · `context` 요약 · title · msg_count
  - `commit_turn()` — 메시지 적재 → 저장 → absorb 필요 여부 판단
- `absorb.py` — 버퍼가 차면 별도 LLM 호출로 대화를 압축해 `title`·`context`를 재생성하고 **버퍼를 비운다.**
  사용자가 제목을 직접 정했으면(`is_manual_title`) 덮어쓰지 않는다.
- `session_service.py` — 세션 생성·목록·이름변경·삭제
- `turn_service.py` — **한 턴의 오케스트레이션.** 메시지 수신 → 컨텍스트 조립 → LLM 스트리밍(tool call 포함) → 도구 실행 위임 → 커밋

**이 코어는 문서를 들고 있지 않다.** 문서가 필요하면 `llm/tools/`를 통해 문서 코어에 묻는다.
확정된 메시지는 Postgres가 진실원천. Redis는 잃어도 복구 가능해야 한다.

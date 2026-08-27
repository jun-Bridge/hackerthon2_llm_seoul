# chat/ — 대화 코어 (세션 컨테이너)

**상주하지 않는다.** 요청마다 컨테이너를 만들고 Redis에서 상태를 복원한다.

구현 예정
- `container.py` — 세션 컨테이너
  - Redis에서 복원: 최근 메시지 버퍼 · `context` 요약 · title · msg_count
  - `commit_turn()` — 메시지 적재 → 저장 → absorb 필요 여부 판단
- `absorb.py` — 버퍼가 차면 별도 LLM 호출로 대화를 압축해 `title`·`context`를 재생성하고 **버퍼를 비운다.**
  사용자가 제목을 직접 정했으면(`is_manual_title`) 덮어쓰지 않는다.
- `session_service.py` — 세션 생성·목록·이름변경·삭제
- `context.py` — 다음 턴에 넘길 컨텍스트 조립 (버퍼 + context 요약 + 직전 제안 처리 결과)

**턴 실행 자체는 여기가 아니라 `orchestrator/`가 한다.** 이 코어는 대화 상태만 소유한다.

**이 코어는 문서를 들고 있지 않다.** `document/`를 import하지 않는다.
확정된 메시지는 Postgres가 진실원천. Redis는 잃어도 복구 가능해야 한다.

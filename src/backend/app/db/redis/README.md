# db/redis/ — 휘발성 저장소

구현 예정
- `client.py` — 커넥션 풀, 앱 수명주기에 맞춘 연결·해제
- `session_store.py` — 사용자 세션 상태
- `stream_buffer.py` — LLM 토큰 스트림 버퍼. SSE 연결이 끊겼다 재연결해도 이어받게 한다.
- `cache.py` — 짧은 TTL 캐시 (반복 요청·문서 렌더 결과)

여기 있는 데이터는 **잃어도 되는 것만.** 잃으면 안 되는 건 postgres로.

# db/postgres/ — 영속 저장소

구현 예정
- `session.py` — 엔진 생성, 세션 팩토리, 트랜잭션 컨텍스트
- `base.py` — 공통 declarative base, 타임스탬프 믹스인
- `models/` — SQLAlchemy ORM
  - `conversation.py` — 대화 스레드
  - `message.py` — 대화 메시지 (role, content, 생성 시각)
  - `document.py` — 캔버스 문서 (제목, 현재 버전 포인터)
  - `document_version.py` — 문서 버전 스냅샷 (편집형 캔버스의 되돌리기 근거)
- `repositories/` — 쿼리 캡슐화. 서비스는 여기까지만 안다.
  - `conversation_repo.py` · `document_repo.py`

ORM 모델은 이 폴더 밖으로 나가지 않는다. 경계를 넘을 땐 `schemas/`의 Pydantic 타입으로 변환.

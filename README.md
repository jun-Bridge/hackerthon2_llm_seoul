# hackerthon2_llm_seoul

문서화(캔버스) 기능이 있는 웹 LLM 서비스.
백엔드 FastAPI(Python) + 프론트엔드 React(Vite/TS) 분리, 로컬 LLM(gpt-oss-120b), PostgreSQL + Redis.

> 목적·유스케이스·수용기준의 단일 진실원천(SSoT)은 `docs/requirements.md`.
> 진행 과정·결정 이유는 `docs/dev-log.md`(append-only).

## 이 레포의 경계
- **여기서 하는 것**: 애플리케이션 코드 개발 + git 연동.
- **여기서 안 하는 것**: AWS 프로비저닝·배포·업로드 — **Kiro IDE에서 별도로 처리**한다.
  `docker/`는 로컬 개발 환경(compose)용이지 프로덕션 배포 정의가 아니다.

## 디렉토리 레이아웃

```
.
├── docker/                로컬 개발 컨테이너 정의 (compose·Dockerfile)
├── docs/                  문서 (SSoT)
│   ├── requirements.md      WHAT — 목적·범위·제약·수용기준
│   └── dev-log.md           과정 — 결정·시도·막힌 것 (append-only)
├── resource/              샘플 데이터·자료·Figma 익스포트
│   └── samples/
└── src/
    ├── backend/           FastAPI
    │   ├── alembic/         DB 마이그레이션
    │   │   └── versions/
    │   ├── app/
    │   │   ├── api/routes/  HTTP 엔드포인트 (얇게 — 로직 금지)
    │   │   ├── cache/       Redis 클라이언트·세션/스트림 버퍼
    │   │   ├── core/        설정·env 로딩·로깅
    │   │   ├── db/
    │   │   │   ├── models/       SQLAlchemy ORM 모델
    │   │   │   └── repositories/ 쿼리 캡슐화 (서비스는 ORM을 직접 안 만짐)
    │   │   ├── llm/         LLM 클라이언트 추상화 (base + gpt-oss 구현)
    │   │   ├── schemas/     Pydantic 요청·응답 계약
    │   │   └── services/    도메인 로직 (chat / document·canvas)
    │   └── tests/
    │       ├── unit/          services·llm — 외부 의존 없음
    │       └── integration/   API·DB·Redis 붙은 경로
    └── frontend/          React + Vite + TypeScript
        ├── public/
        └── src/
            ├── api/         백엔드 클라이언트 (fetch/SSE 래퍼)
            ├── components/
            │   ├── canvas/    문서 편집(캔버스) UI
            │   ├── chat/      대화 UI
            │   └── common/    공용 프리미티브
            ├── hooks/
            ├── pages/
            └── styles/
```

### 경계 규약
- `api/routes/`는 요청 파싱 → `services/` 호출 → 응답 직렬화만. 비즈니스 로직은 `services/`.
- `services/`는 `db/repositories/`를 통해서만 DB에 접근한다. ORM 모델이 라우트나 스키마로 새지 않게.
- LLM 호출은 전부 `llm/base.py` 인터페이스를 거친다. 모델·서빙 백엔드 교체가 `llm/` 안에서 끝나야 한다.
- 시크릿은 `.env`만. 하드코딩 금지. `.env.example`은 키 이름·형식만.

## 개발

아직 착수 전 — `docs/requirements.md` 승인 후 빌드 시작.

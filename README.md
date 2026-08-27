# hackerthon2_llm_seoul

웹 LLM 서비스. 백엔드 FastAPI(Python) + 프론트엔드 React(Vite/TS) 분리 구조.

> 목적·유스케이스·수용기준의 단일 진실원천(SSoT)은 `docs/requirements.md`.
> 진행 과정·결정 이유는 `docs/dev-log.md`(append-only).

## 디렉토리 레이아웃

```
.
├── docs/                  문서 (SSoT)
│   ├── requirements.md      WHAT — 목적·범위·제약·수용기준
│   └── dev-log.md           과정 — 결정·시도·막힌 것 (append-only)
├── resource/              샘플 데이터·자료
│   └── samples/
└── src/
    ├── backend/           FastAPI
    │   ├── app/
    │   │   ├── api/routes/  HTTP 엔드포인트 (얇게 — 로직 금지)
    │   │   ├── core/        설정·env 로딩·로깅
    │   │   ├── llm/         LLM 프로바이더 추상화 (base + ollama 구현)
    │   │   ├── schemas/     Pydantic 요청·응답 계약
    │   │   └── services/    도메인 로직 (테스트 대상)
    │   └── tests/
    └── frontend/          React + Vite + TypeScript
        ├── public/
        └── src/
            ├── api/         백엔드 클라이언트 (fetch 래퍼)
            ├── components/  재사용 UI
            ├── hooks/
            ├── pages/
            └── styles/
```

### 경계 규약
- `api/routes/`는 요청 파싱 → `services/` 호출 → 응답 직렬화만. 비즈니스 로직은 `services/`.
- LLM 호출은 전부 `llm/base.py`의 인터페이스를 거친다. 프로바이더 교체가 `llm/` 안에서 끝나야 한다.
- 시크릿은 `.env`만. 하드코딩 금지. `.env.example`은 키 이름·형식만.

## 개발

아직 착수 전 — `docs/requirements.md` 승인 후 빌드 시작.

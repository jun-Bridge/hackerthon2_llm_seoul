# Requirements — hackerthon2_llm_1
_created: 2026-08-27 · status: **drafting** → reviewing → approved(사용자 "됐다" 시 승격, 이때만 빌드 착수)_

## 1. 목적 (한 문장)
TBD

## 2. 사용자·이해관계자
TBD

## 3. 범위
### In scope
TBD
### Out of scope (YAGNI)
TBD

## 4. 핵심 유스케이스
TBD

## 5. 비기능 제약 (성능·리소스·보안·가용성)
TBD

## 6. 데이터·계약 (스키마·API·인터페이스)
TBD

## 7. 기술 스택·환경
- **백엔드**: Python + FastAPI. `src/backend/`
- **프론트엔드**: React + Vite + TypeScript. `src/frontend/`
- **LLM**: 로컬 모델 (Ollama). 프로바이더는 `app/llm/base.py` 인터페이스 뒤로 추상화 — 교체 가능하게.
- **배포**: Vercel/클라우드 (사용자 선택) — ⚠ 로컬 Ollama와 충돌. 슬롯 9 참조.
- **디자인 언어**: TBD (외부 GUI 있음 — 디자인 언어 미고정 상태)

## 8. 수용 기준 (Acceptance — 기계검증 가능: 테스트·명령·수치. 마일스톤별)
TBD

## 9. 리스크·미결 (TBD)
- **[충돌] 로컬 Ollama vs Vercel 배포**: Vercel 서버리스 함수는 상주 프로세스·GPU가 없어 Ollama를 띄울 수 없고, 실행시간·메모리 상한 때문에 로컬 추론이 불가능하다. 셋 중 하나로 해소 필요 —
  (a) 배포를 GPU 있는 서버/자체 호스팅(Docker)으로 바꾼다,
  (b) LLM을 API 프로바이더로 바꾸고 Vercel을 유지한다,
  (c) 프론트만 Vercel, 백엔드+Ollama는 별도 호스팅(터널/사설망) — CORS·지연·공개 접근성 검토 필요.
- 서비스 목적(슬롯 1)·유스케이스(슬롯 4) 미정 — 사용자 요청으로 보류 중. 수용기준(슬롯 8)이 여기 종속.
- 해커톤 일정·제출 마감 미확인

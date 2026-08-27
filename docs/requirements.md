# Requirements — hackerthon2_llm_1
_created: 2026-08-27 · status: **drafting** → reviewing → approved(사용자 "됐다" 시 승격, 이때만 빌드 착수)_

## 1. 목적 (한 문장)
TBD

## 2. 사용자·이해관계자
TBD

## 3. 범위
### In scope
- 웹 LLM 서비스 애플리케이션 코드 (백엔드 + 프론트엔드)
- **문서화(캔버스) 기능** — 상세 정의 TBD (슬롯 4)
- 로컬 개발용 컨테이너 정의 (`docker/`)
- git 연동 (origin: `jun-Bridge/hackerthon2_llm_seoul`)
### Out of scope (YAGNI)
- **AWS 프로비저닝·배포·업로드 — Kiro IDE에서 별도 처리.** 이 레포는 개발 + git까지.
- 프로덕션 인프라 정의(Terraform·ECS 태스크 정의 등)

## 4. 핵심 유스케이스
TBD

## 5. 비기능 제약 (성능·리소스·보안·가용성)
TBD

## 6. 데이터·계약 (스키마·API·인터페이스)
TBD

## 7. 기술 스택·환경
- **백엔드**: Python + FastAPI. `src/backend/`
- **프론트엔드**: React + Vite + TypeScript. 시안은 Figma. `src/frontend/`
- **LLM**: 로컬 **gpt-oss-120b**. OpenAI 호환 엔드포인트로 서빙(vLLM 등) 가정.
  클라이언트는 `app/llm/base.py` 인터페이스 뒤로 추상화 — 모델·서빙 백엔드 교체가 `llm/` 안에서 끝나게.
- **DB**: PostgreSQL (영속 — 대화·문서·버전), Redis (캐시·세션·스트리밍 버퍼)
- **컨테이너**: Docker. 이 레포의 `docker/`는 **로컬 개발용**.
- **배포**: AWS — **Kiro IDE에서 처리. 이 레포 범위 밖**(슬롯 3 Out of scope).
- **디자인 언어**: Figma 시안 기준. DESIGN.md 미고정 — TBD.

## 8. 수용 기준 (Acceptance — 기계검증 가능: 테스트·명령·수치. 마일스톤별)
TBD

## 9. 리스크·미결 (TBD)
- ~~[충돌] 로컬 Ollama vs Vercel 배포~~ → **해소**: 배포 대상이 AWS + Docker로 확정(2026-08-27).
- **[리스크] gpt-oss-120b 서빙 자원**: 117B MoE 모델. MXFP4 양자화 기준 단일 80GB급 GPU가 필요하다.
  개발 중 어느 엔드포인트를 붙일지 미정 — 로컬 GPU가 없으면 개발 단계에서 소형 모델로 대체할지 결정 필요.
- **[미정] 캔버스 기능의 실제 동작**: "문서화(캔버스)"가 아래 중 무엇인지 확정 필요 —
  (a) LLM이 생성한 문서를 옆 패널에서 사람이 직접 편집 + 선택 영역을 LLM에 재요청(ChatGPT/Claude Canvas형),
  (b) 대화 내용을 문서로 정리·내보내기(요약·리포트 생성),
  (c) 자유 배치 화이트보드(노드·도형).
  → 이 선택이 DB 스키마(문서·버전·diff)와 프론트 컴포넌트 구조를 가른다.
- 서비스 목적(슬롯 1)·유스케이스(슬롯 4) 미정 — 사용자 요청으로 보류 중. 수용기준(슬롯 8)이 여기 종속.
- 해커톤 일정·제출 마감 미확인

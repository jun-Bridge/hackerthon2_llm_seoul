# docs/ — 문서 안내

정본(SSoT)과 참고 문서가 나뉜다. **스펙이 바뀌면 정본을 고치고, 이유는 dev-log에 남긴다.**

## 정본 (Single Source of Truth)

- `.kiro/specs/complaint-assistant/requirements.md` — **WHAT의 단일 진실원천.** 목적·범위·제약·데이터 모델·상태 전이·수용기준. 스펙이 바뀌면 여기를 먼저 고친다.
- `api-contract.md` — **프론트·백엔드 HTTP 경계.** 26개 엔드포인트의 요청/응답/오류 코드. 한쪽이 이 문서를 어기면 버그다.
- `backend-design.md` — **서버 안쪽 모듈·계층·흐름.** routes→services→repo/session/llm. 내부 구조가 바뀌어도 계약은 그대로.

## 운영·사용 문서

- `aws-deployment.md` — **실제 배포 방식.** EC2 단일 인스턴스에 PostgreSQL·Redis 직접 설치, systemd(`univoice`)로 8501 서빙. 재배포 절차 포함.
- `data-layer-usage.md` — 서비스가 `pool`·`repo`·`session`을 부르는 표준 패턴.
- `e2e-scenario-log.md` — 실서버 종단 시나리오 기록.
- `postmortem-frontend-integration.md` — **사후 분석.** 연동된 프론트 코드가 목업으로 두 번 덮어써진 건. 원인·증상 대응표·재발 방지.
- `dev-log.md` — **과정 기록. append-only.** 결정과 이유, 시도·막힘. 과거 항목은 수정하지 않는다.

## 계획·히스토리 (과거 버전 — 참고용)

- `proposal_v1.md`, `requirements_v1.md` — 초기 제안·요구안. **정본보다 앞선 버전**이라 상태값·카테고리가 다르다. 현재 정본은 위 `.kiro/specs/...`.
- `roadmap-B-data-layer.md`, `team-split.md` — 팀 분담·로드맵.
- `anonymous_complain_assistant*.html` — 초기 UI 목업. 정본보다 앞선 버전.

규칙: 스펙은 requirements(.kiro), 경계는 api-contract, 내부는 backend-design, 이유는 dev-log. 섞지 않는다.

# Kiro Spec 구조 설명

이 프로젝트는 **두 가지 요구사항을 동시에 만족**합니다:

1. **독립 설계** (`docs/`)
   - `requirements.md`: 전체 시스템 설계 (FastAPI + React)
   - `proposal.md`: 제안서 (두 코어, 제안/승인, 줄 단위 모델)
   - `dev-log.md`: 결정 과정 기록

2. **AWS Bedrock 해커톤 제약** (`.kiro/specs/complaint-assistant/`)
   - `requirements.md`: User Stories + Acceptance Criteria
   - `design.md`: 이중 트랙 아키텍처
   - `tasks.md`: 38개 구체적 태스크

## 이중 트랙 전략

### Track A: Streamlit 프로토타입 (대회 제출)
- **스택**: Streamlit + AWS Bedrock + FAISS
- **배포**: EC2 (팀 키로 접속)
- **범위**: M0~M5 (38개 태스크)
- **목표**: 빠른 프로토타입 + 데모 완성

### Track B: FastAPI + React (확장 구조)
- **스택**: FastAPI + React + PostgreSQL + Redis + Bedrock
- **범위**: `docs/requirements.md` 전체
- **목표**: 프로덕션 레벨 확장성
- **시점**: 대회 후 구현

## 핵심 설계 원칙 (공통)

1. **두 개의 코어**: 대화 코어 + 문서 코어 (서로 import 금지)
2. **LLM 소유 금지**: 읽기는 함수로, 쓰기는 제안만
3. **제안 → diff → 승인**: 사용자가 최종 결정
4. **줄 단위 문서**: 마크다운 한 줄 = 블록 하나

## 시작 방법

### 1. Kiro spec으로 작업 시작
```bash
cd .kiro/specs/complaint-assistant
# requirements.md, design.md, tasks.md 확인
```

### 2. 첫 태스크 실행
```bash
# M0-TASK-001: Bedrock API 연결 테스트
python bedrock_simple_test.py
```

### 3. Streamlit 앱 실행
```bash
streamlit run app.py
```

## 문서 관계

```
.kiro/specs/complaint-assistant/  # ★ 대회 정본 — 어긋나면 이쪽이 이긴다
├─ requirements.md              # User Stories (M0~M6)
├─ design.md                    # 이중 트랙 아키텍처
└─ tasks.md                     # 38개 구체적 태스크

docs/                           # Track B 설계 (대회 후)
├─ requirements.md              # FastAPI + React 상세
├─ proposal.md                  # 제안서
└─ dev-log.md                   # 결정 과정
```

`docs/kiro_*.md`에 있던 사본은 지웠다. **같은 내용을 두 벌 두면 한쪽만 고쳐지고 어느 게 맞는지 알 수 없게 된다.**

**둘의 관계**: Kiro spec은 docs의 **실행 가능한 부분집합**입니다.
- Track A = Kiro spec 전체
- Track B = docs 전체 (Track A 포함 + 확장)

## 다음 단계

1. **M0 검증** (TASK-001~004): Bedrock 연결 + EC2 설정
2. **M1~M3 구현** (TASK-101~304): 대화 + 문서 + 제안/승인
3. **M4~M5 완성** (TASK-401~505): 편집 + 대회 제출 준비
4. **대회 후 Track B 확장** (선택)

## 참고

- **대회 가이드**: `TEAM_GUIDE.html` (TASK-501에서 생성)
- **배포 스크립트**: `deploy.sh` (TASK-504)
- **기존 설계 문서**: `docs/` (설계 원칙 참조)

# 민원 작성 도우미 — Requirements

## Overview

**시설 민원을 대화로 작성해 문서로 완성하는 웹 도구**

사용자가 겪은 상황을 채팅으로 말하면 LLM(AWS Bedrock)이 민원 문서로 정리해 **제안**하고, 사용자가 확인·수정해 완성합니다.

### 핵심 설계 원칙

> **LLM은 문서를 소유하지 않는다.**
> 필요할 때 함수로 읽고, 고치고 싶으면 제안만 한다. 실제 반영은 언제나 사용자가 한다.

### 대회 제약 사항

- **LLM**: AWS Bedrock (Claude 3 Sonnet 또는 Haiku)
- **프론트엔드**: Streamlit (빠른 프로토타이핑)
- **배포**: EC2 (팀 키 `hackathon-{팀ID}-key.pem` 사용)
- **문서 검색**: FAISS 기반 RAG (선택적)

---

## User Stories

### Epic 1: 계정 관리
- **US-1.1** 사용자로서 이메일과 비밀번호로 가입하고 싶다
- **US-1.2** 사용자로서 로그인하고 내 세션 목록을 보고 싶다
- **US-1.3** 사용자로서 비밀번호를 변경하고 싶다
- **US-1.4** 사용자로서 계정을 탈퇴하고 내 모든 데이터가 삭제되길 원한다

### Epic 2: 대화와 세션
- **US-2.1** 사용자로서 새 대화를 시작하고 싶다
- **US-2.2** 사용자로서 과거 대화를 이어가고 싶다
- **US-2.3** 사용자로서 대화 제목이 자동으로 생성되길 원한다
- **US-2.4** 사용자로서 LLM 응답이 실시간으로 스트리밍되길 원한다

### Epic 3: 문서 편집 (캔버스)
- **US-3.1** 사용자로서 LLM이 만든 문서를 옆 화면에서 보고 싶다
- **US-3.2** 사용자로서 문서를 자유롭게 수정하고 싶다
- **US-3.3** 사용자로서 LLM에게 "이 부분만 다시 써줘"라고 요청하고 싶다
- **US-3.4** 사용자로서 마크다운 파일로 다운로드하고 싶다

### Epic 4: 제안과 승인
- **US-4.1** 사용자로서 LLM의 편집을 diff로 확인하고 싶다
- **US-4.2** 사용자로서 제안을 적용하거나 거절할 수 있어야 한다
- **US-4.3** 사용자로서 LLM이 내 편집을 덮어쓰지 않길 원한다
- **US-4.4** 사용자로서 잘못 적용한 것을 실행취소하고 싶다

### Epic 5: 대회 필수 기능
- **US-5.1** 심사위원으로서 Bedrock 호출 로그를 확인하고 싶다
- **US-5.2** 팀원으로서 EC2에 배포된 앱에 접속하고 싶다
- **US-5.3** 사용자로서 민원 양식 샘플을 RAG로 참조하고 싶다 (선택)

---

## Technical Architecture

### 두 개의 구현 트랙

#### Track A: Streamlit 프로토타입 (대회 제출용)
```
app.py                          # Streamlit 메인 UI
├─ bedrock_simple_test.py       # Bedrock 연결 테스트
├─ bedrock_faiss_indexer.py     # 민원 양식 인덱싱
└─ bedrock_faiss_rag_chatbot.py # RAG 기반 대화 + 문서 생성
```

**특징:**
- 빠른 프로토타이핑, 대회 요구사항 충족
- 세션 관리는 Streamlit session_state
- 문서는 메모리 + 로컬 파일 저장

#### Track B: FastAPI + React (확장 가능 구조)
```
backend/
├─ app/orchestrator/    # 턴 실행기
├─ app/chat/            # 대화 코어
├─ app/document/        # 문서 코어
└─ app/llm/             # Bedrock 클라이언트

frontend/
├─ src/components/chat/
└─ src/components/canvas/
```

**특징:**
- 프로덕션 레벨 확장성
- PostgreSQL + Redis 백엔드
- 두 코어 분리 원칙 유지

### 공통 LLM 인터페이스

둘 다 같은 도구 호출 구조 사용:

```python
# 읽기 (즉시 실행)
read_document() -> List[Line]

# 쓰기 (제안만)
propose_replace_line(line_id, text)
propose_insert_lines(after_line_id, texts[])
propose_delete_lines(line_ids[])
propose_replace_document(lines[])
```

Bedrock Claude는 도구 호출을 지원하므로 기존 설계 그대로 적용.

---

## Data Models

### PostgreSQL (Track B만)
```
app_user ──< session ──< message
                  └──── document ──< line
```

### Streamlit Session State (Track A)
```python
st.session_state = {
    'user_id': str,
    'sessions': List[Session],
    'current_session': Session,
    'document_lines': List[Line],
    'proposal_buffer': List[Edit],
    'undo_stack': List[Snapshot]
}
```

### 문서 구조 (공통)
```python
@dataclass
class Line:
    id: str              # UUID
    line_order: int      # 0부터 시작
    content: str         # 마크다운 한 줄
    is_temp: bool = False  # 제안 중 임시 줄
```

---

## Acceptance Criteria

### M0 — 대회 환경 검증
- [ ] Bedrock API 호출 성공 (`bedrock_simple_test.py`)
- [ ] Claude 3 Sonnet 도구 호출 지원 확인
- [ ] EC2 인스턴스 생성 및 팀 키로 SSH 접속
- [ ] Streamlit 앱이 브라우저에서 열림
- [ ] `requirements.txt` 패키지 설치 완료

### M1 — 기본 대화 (Track A)
- [ ] 사용자가 메시지를 입력하고 Bedrock 응답을 받는다
- [ ] 응답이 스트리밍으로 표시된다
- [ ] 대화 이력이 화면에 남는다
- [ ] 세션을 새로 시작할 수 있다

### M2 — 문서 생성과 표시
- [ ] "민원 문서로 정리해줘" 입력 시 문서가 생성된다
- [ ] 문서가 화면 오른쪽에 마크다운으로 표시된다
- [ ] 문서를 `.md` 파일로 다운로드할 수 있다
- [ ] 줄 단위로 구조화되어 있다 (내부 구조 검증)

### M3 — 제안과 승인 (핵심)
- [ ] LLM이 `propose_*` 도구를 호출하면 제안 버퍼에 쌓인다
- [ ] 제안이 diff(+/−)로 화면에 표시된다
- [ ] "적용" 버튼을 누르면 문서가 바뀐다
- [ ] "취소" 버튼을 누르면 문서가 그대로다
- [ ] 제안 대기 중 문서 편집이 막힌다
- [ ] 실행취소로 이전 상태로 돌아간다

### M4 — 사용자 편집
- [ ] 문서 텍스트를 직접 수정할 수 있다
- [ ] "이 부분만 다시 써줘"가 동작한다
- [ ] LLM이 최신 문서 내용을 읽는다
- [ ] 사용자 편집과 LLM 수정이 충돌하지 않는다

### M5 — 대회 제출 (Track A)
- [ ] EC2 공개 IP로 외부 접속 가능
- [ ] `TEAM_GUIDE.html` 가이드 문서 포함
- [ ] Bedrock 사용량 모니터링 스크립트 포함
- [ ] README에 팀 정보와 실행 방법 기재

### M6 — RAG 통합 (선택)
- [ ] `bedrock_faiss_indexer.py`로 민원 양식 인덱싱
- [ ] `bedrock_faiss_rag_chatbot.py`로 유사 사례 검색
- [ ] 문서 생성 시 참조 사례가 프롬프트에 포함됨

---

## Technical Constraints

### 필수 제약
- **LLM**: AWS Bedrock (Claude 3 계열)
- **배포**: EC2 (대회 제공 인스턴스)
- **인증**: 팀 키 (`hackathon-{팀ID}-key.pem`)
- **비용**: Bedrock 사용량 제한 내

### 권장 사항
- Streamlit secrets로 AWS 자격증명 관리
- CloudWatch Logs로 Bedrock 호출 모니터링
- FAISS 인덱스는 로컬 파일로 저장 (`.faiss`)

### 선택 사항
- PostgreSQL/Redis (Track B용, 프로토타입에는 과도)
- React 프론트엔드 (Streamlit로 충분)
- 계정 시스템 (단일 사용자로 단순화 가능)

---

## Development Phases

### Phase 1: Bedrock 검증 (1일)
1. `bedrock_simple_test.py` 작성 및 실행
2. 도구 호출 테스트 (`read_document`, `propose_*`)
3. EC2 배포 및 외부 접속 확인

### Phase 2: Streamlit 프로토타입 (2일)
1. `app.py` 기본 UI (채팅 + 문서 패널)
2. `bedrock_faiss_rag_chatbot.py` 통합
3. 제안/승인 UI 구현
4. 실행취소 스택 추가

### Phase 3: 문서 코어 로직 (2일)
1. 줄 단위 모델 구현
2. 제안 버퍼와 diff 계산
3. 임시 id 관리
4. 도구 호출 executor

### Phase 4: 대회 제출 준비 (1일)
1. EC2 배포 자동화
2. `TEAM_GUIDE.html` 작성
3. 데모 시나리오 준비
4. 비용 모니터링 설정

### Phase 5: Track B 확장 (선택)
FastAPI + React 구조로 확장 (대회 이후)

---

## Out of Scope (1차)

- 복수 사용자 계정 (단일 사용자로 충족)
- 이미지 첨부 (텍스트 민원만)
- 민원서 양식 강제 (자유 형식)
- 실제 접수처 제출

---

## Success Metrics

### 대회 심사 기준
- Bedrock 활용도 (도구 호출 사용 여부)
- 데모 완성도 (제안/승인 흐름 시연)
- 아이디어 독창성 (LLM이 문서를 소유하지 않는 설계)

### 기술 지표
- Bedrock 응답 시간 < 3초
- 제안 생성 성공률 > 90%
- 사용자 편집 후 LLM 읽기 정확도 100%

---

## References

- [AWS Bedrock 문서](https://docs.aws.amazon.com/bedrock/)
- [Claude 3 도구 호출](https://docs.anthropic.com/claude/docs/tool-use)
- [Streamlit 문서](https://docs.streamlit.io/)
- 기존 설계 문서: `docs/requirements.md`, `docs/proposal.md`

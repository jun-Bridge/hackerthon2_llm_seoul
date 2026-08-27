# 민원 작성 도우미 — Design

## Architecture Overview

### 이중 트랙 전략

```
┌─────────────────────────────────────────────────────────┐
│                    AWS Bedrock (Claude 3)                │
│                    (공통 LLM 백엔드)                      │
└────────────────┬────────────────────────┬───────────────┘
                 │                        │
    ┌────────────▼──────────┐  ┌─────────▼────────────┐
    │   Track A: Streamlit  │  │  Track B: FastAPI    │
    │   (대회 제출용)        │  │  (확장 구조)          │
    └───────────────────────┘  └──────────────────────┘
```

### Track A: Streamlit 프로토타입

```
app.py (메인 UI)
├─ 왼쪽 패널: 채팅
│  └─ st.chat_input() / st.chat_message()
├─ 오른쪽 패널: 문서
│  ├─ 마크다운 표시
│  ├─ 편집 텍스트 영역
│  └─ 버튼: 적용 / 취소 / 다운로드
└─ 하단: 제안 diff 표시

bedrock_faiss_rag_chatbot.py
├─ BedrockClient: API 호출
├─ DocumentCore: 문서 관리
├─ ProposalManager: 제안 버퍼
└─ ToolExecutor: 도구 실행

bedrock_faiss_indexer.py (선택)
└─ 민원 양식 샘플 인덱싱
```

#### Streamlit Session State 구조

```python
st.session_state = {
    # 사용자
    'user_id': 'demo_user',  # 단일 사용자
    
    # 세션
    'sessions': [
        {
            'id': str,
            'title': str,
            'created_at': datetime,
            'messages': List[Message],
            'document': Document
        }
    ],
    'current_session_id': str,
    
    # 문서
    'document': {
        'lines': List[Line],
        'dirty': bool
    },
    
    # 제안
    'proposal': {
        'edits': List[Edit],
        'diff': List[DiffLine],
        'ttl': datetime
    } | None,
    
    # 편집 이력
    'undo_stack': List[Snapshot],
    'redo_stack': List[Snapshot],
    
    # 잠금
    'locked': bool,
    'lock_reason': str
}
```

### Track B: FastAPI + React (참조 구조)

```
                 ┌─────────────────────────────┐
                 │       오케스트레이터         │
                 │  · 턴 수명                   │
                 │  · 도구 루프                 │
                 │  · 잠금                      │
                 │  · 저장 트리거               │
                 └──┬──────────┬───────────┬───┘
                    │          │           │
         ┌──────────▼──┐ ┌─────▼──────┐ ┌──▼──────────┐
         │  대화 코어   │ │ 문서 코어   │ │ Bedrock 클라이언트│
         ├─────────────┤ ├────────────┤ ├─────────────┤
         │ 메시지 버퍼  │ │ 줄 목록     │ │ 스트리밍     │
         │ 맥락 요약    │ │ 제안 버퍼   │ │ 도구 호출    │
         │ 제목 생성    │ │ 되돌리기    │ │             │
         └─────────────┘ │ 편집 잠금   │ └─────────────┘
                         └────────────┘
```

**Track B는 1차에서 구현하지 않음.** 설계만 유지하고 Streamlit 완성 후 확장.

---

## Component Design (Track A)

### 1. BedrockClient

**책임**: AWS Bedrock API 호출, 도구 호출 처리

```python
class BedrockClient:
    def __init__(self, model_id: str = "anthropic.claude-3-sonnet"):
        self.bedrock = boto3.client('bedrock-runtime')
        self.model_id = model_id
    
    def stream_with_tools(
        self,
        messages: List[Message],
        tools: List[Tool],
        callback: Callable[[str], None]
    ) -> ToolCalls:
        """
        스트리밍으로 응답을 받으면서 도구 호출을 수집한다.
        
        Args:
            messages: 대화 이력
            tools: 제공할 도구 정의
            callback: 토큰마다 호출될 함수
            
        Returns:
            도구 호출 목록 (없으면 빈 리스트)
        """
        request = {
            "modelId": self.model_id,
            "messages": messages,
            "tools": tools,
            "temperature": 0.7
        }
        
        tool_calls = []
        for event in self.bedrock.invoke_model_with_response_stream(**request):
            chunk = event['chunk']
            
            if 'text' in chunk:
                callback(chunk['text'])
            
            if 'tool_use' in chunk:
                tool_calls.append(chunk['tool_use'])
        
        return tool_calls
```

### 2. DocumentCore

**책임**: 문서 줄 관리, 제안 버퍼, diff 계산

```python
@dataclass
class Line:
    id: str
    line_order: int
    content: str
    is_temp: bool = False

@dataclass
class Edit:
    type: Literal['replace', 'insert', 'delete', 'replace_all']
    line_id: str | None
    after_line_id: str | None
    texts: List[str]

class DocumentCore:
    def __init__(self):
        self.lines: List[Line] = []
        self.proposal_buffer: List[Edit] = []
    
    def read(self) -> List[Line]:
        """
        제안이 반영된 가상 뷰 반환.
        LLM이 보는 것 = 현재 문서 + 쌓인 제안
        """
        virtual_lines = self.lines.copy()
        
        for edit in self.proposal_buffer:
            if edit.type == 'replace':
                idx = self._find_line_index(edit.line_id, virtual_lines)
                virtual_lines[idx] = Line(
                    id=edit.line_id,
                    line_order=idx,
                    content=edit.texts[0],
                    is_temp=False
                )
            elif edit.type == 'insert':
                # ... 삽입 로직
            elif edit.type == 'delete':
                # ... 삭제 로직
            elif edit.type == 'replace_all':
                virtual_lines = [
                    Line(id=uuid4(), line_order=i, content=text)
                    for i, text in enumerate(edit.texts)
                ]
        
        return virtual_lines
    
    def propose_replace(self, line_id: str, text: str):
        """제안 버퍼에 추가만 한다. 실제 문서는 안 바뀜."""
        self.proposal_buffer.append(
            Edit(type='replace', line_id=line_id, texts=[text])
        )
    
    def calculate_diff(self) -> List[DiffLine]:
        """
        현재 문서 vs 제안 적용 결과를 텍스트 diff로 비교.
        """
        current = [line.content for line in self.lines]
        proposed = [line.content for line in self.read()]
        
        return difflib.unified_diff(current, proposed)
    
    def accept_proposal(self) -> Snapshot:
        """
        제안을 실제 적용하고 되돌리기용 스냅샷 반환.
        """
        snapshot = Snapshot(lines=self.lines.copy())
        self.lines = self.read()
        self.proposal_buffer.clear()
        return snapshot
    
    def reject_proposal(self):
        """제안을 버린다. 문서는 그대로."""
        self.proposal_buffer.clear()
```

### 3. ToolExecutor

**책임**: Bedrock 도구 호출을 DocumentCore 메서드로 라우팅

```python
class ToolExecutor:
    def __init__(self, doc_core: DocumentCore):
        self.doc_core = doc_core
        self.tools = self._define_tools()
    
    def _define_tools(self) -> List[Tool]:
        """Bedrock에 제공할 도구 정의"""
        return [
            {
                "name": "read_document",
                "description": "현재 문서의 모든 줄을 읽는다.",
                "input_schema": {
                    "type": "object",
                    "properties": {}
                }
            },
            {
                "name": "propose_replace_line",
                "description": "특정 줄의 내용을 바꾸는 제안을 낸다.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "line_id": {"type": "string"},
                        "text": {"type": "string"}
                    },
                    "required": ["line_id", "text"]
                }
            },
            # ... 나머지 도구
        ]
    
    def execute(self, tool_call: dict) -> dict:
        """
        도구 호출을 실행하고 결과를 반환.
        오류는 예외로 터뜨리지 않고 결과에 담는다.
        """
        name = tool_call['name']
        args = tool_call['input']
        
        try:
            if name == 'read_document':
                lines = self.doc_core.read()
                return {
                    "content": [
                        {"id": l.id, "line_order": l.line_order, "content": l.content}
                        for l in lines
                    ]
                }
            
            elif name == 'propose_replace_line':
                self.doc_core.propose_replace(args['line_id'], args['text'])
                return {"status": "proposed"}
            
            # ... 나머지 도구
            
        except Exception as e:
            return {"error": str(e)}
```

### 4. ProposalManager

**책임**: 제안 TTL, 메아리 방지, 잠금 관리

```python
class ProposalManager:
    def __init__(self, ttl_seconds: int = 300):
        self.ttl_seconds = ttl_seconds
        self.proposal_created_at: datetime | None = None
    
    def has_proposal(self, doc_core: DocumentCore) -> bool:
        """살아있는 제안이 있는지"""
        if not doc_core.proposal_buffer:
            return False
        
        if self._is_expired():
            doc_core.reject_proposal()
            self.proposal_created_at = None
            return False
        
        return True
    
    def _is_expired(self) -> bool:
        if not self.proposal_created_at:
            return False
        return (datetime.now() - self.proposal_created_at).seconds > self.ttl_seconds
    
    def create_proposal(self, doc_core: DocumentCore):
        """새 제안 시작"""
        self.proposal_created_at = datetime.now()
    
    def clear_proposal(self):
        """제안 처리 완료"""
        self.proposal_created_at = None
```

---

## UI Design (Streamlit)

### 레이아웃

```
┌────────────────────────────────────────────────────────┐
│  민원 작성 도우미                    [새 대화] [세션 목록] │
├─────────────────────┬──────────────────────────────────┤
│                     │                                  │
│   채팅 패널          │   문서 패널                       │
│                     │                                  │
│  [사용자 메시지]     │  ## 민원 제목                     │
│  [LLM 응답...]      │                                  │
│  [사용자 메시지]     │  발생 일시: 2026-08-27            │
│  [LLM 응답...]      │                                  │
│                     │  내용:                           │
│  ───────────────── │  복도 등이 두 달째 켜지지 않습니다. │
│  💬 메시지 입력     │                                  │
│                     │  [편집 모드] [다운로드]           │
├─────────────────────┴──────────────────────────────────┤
│  📝 제안 대기 중                                         │
│  + 2번째 줄: "발생 일시: 2026-08-27" (추가)              │
│  − 3번째 줄: "내용:" (삭제)                             │
│  + 3번째 줄: "## 상황 설명" (추가)                       │
│                                                         │
│  [✓ 적용] [✗ 취소]                                      │
└─────────────────────────────────────────────────────────┘
```

### 상태별 UI 변화

| 상태 | 채팅 입력 | 문서 편집 | 제안 패널 |
|---|---|---|---|
| 일반 | 활성 | 활성 | 숨김 |
| LLM 응답 중 | 비활성 | 활성 | 숨김 |
| 문서 읽기 중 | 비활성 | **잠금** | 숨김 |
| 제안 대기 | **잠금** | **잠금** | 표시 |

---

## Data Flow

### 한 턴의 흐름 (Streamlit)

```python
def handle_user_message(user_input: str):
    # 1. 시작 조건 확인
    if st.session_state.get('locked'):
        st.error("제안 처리 중입니다")
        return
    
    # 2. 메시지 저장
    messages = st.session_state.current_session['messages']
    messages.append(Message(role='user', content=user_input))
    
    # 3. Bedrock 호출 (스트리밍)
    response_placeholder = st.empty()
    full_response = ""
    
    def token_callback(token: str):
        nonlocal full_response
        full_response += token
        response_placeholder.markdown(full_response)
    
    tool_calls = bedrock_client.stream_with_tools(
        messages=messages,
        tools=tool_executor.tools,
        callback=token_callback
    )
    
    # 4. 응답 저장
    messages.append(Message(role='assistant', content=full_response))
    
    # 5. 도구 호출 처리
    if tool_calls:
        # 첫 read_document에서 잠금
        if any(tc['name'] == 'read_document' for tc in tool_calls):
            st.session_state.locked = True
            st.session_state.lock_reason = 'llm_editing'
        
        # 도구 실행
        for tc in tool_calls:
            result = tool_executor.execute(tc)
            # 결과를 다음 턴 맥락에 추가 (생략)
        
        # 제안이 생겼으면 diff 계산
        if doc_core.proposal_buffer:
            proposal_manager.create_proposal(doc_core)
            diff = doc_core.calculate_diff()
            st.session_state.proposal = {
                'diff': diff,
                'created_at': datetime.now()
            }
        else:
            # 제안 없으면 잠금 해제
            st.session_state.locked = False
    
    # 6. UI 갱신
    st.rerun()
```

### 제안 적용

```python
def accept_proposal():
    # 되돌리기 스택에 넣기
    snapshot = doc_core.accept_proposal()
    st.session_state.undo_stack.append(snapshot)
    st.session_state.redo_stack.clear()
    
    # 제안 정리
    proposal_manager.clear_proposal()
    st.session_state.proposal = None
    st.session_state.locked = False
    
    # 결과 기록
    st.session_state.current_session['messages'].append(
        Message(role='note', content='제안이 적용되었습니다')
    )
    
    st.rerun()
```

---

## File Structure

```
hackerthon2_llm_1/
├─ app.py                           # Streamlit 메인
├─ bedrock_simple_test.py           # API 테스트
├─ bedrock_faiss_indexer.py         # 인덱싱 (선택)
├─ bedrock_faiss_rag_chatbot.py     # RAG 로직 (선택)
├─ requirements.txt                 # 패키지 목록
├─ TEAM_GUIDE.html                  # 팀 가이드
├─ hackathon-{팀ID}-key.pem         # EC2 키
│
├─ .streamlit/
│  └─ secrets.toml                  # AWS 자격증명
│
├─ lib/                             # 핵심 로직
│  ├─ bedrock_client.py
│  ├─ document_core.py
│  ├─ tool_executor.py
│  └─ proposal_manager.py
│
├─ data/                            # 로컬 저장
│  ├─ sessions.json                 # 세션 목록
│  └─ documents/                    # 문서 백업
│     └─ {session_id}.md
│
├─ faiss_index/                     # FAISS (선택)
│  ├─ index.faiss
│  └─ metadata.json
│
├─ docs/                            # 기존 설계 문서
│  ├─ requirements.md
│  ├─ proposal.md
│  └─ dev-log.md
│
├─ .kiro/specs/complaint-assistant/ # Kiro spec
│  ├─ requirements.md
│  ├─ design.md
│  └─ tasks.md
│
└─ src/                             # Track B (미래)
   ├─ backend/
   └─ frontend/
```

---

## Deployment (EC2)

### 1. 인스턴스 접속

```bash
chmod 400 hackathon-{팀ID}-key.pem
ssh -i hackathon-{팀ID}-key.pem ec2-user@<PUBLIC_IP>
```

### 2. 환경 설정

```bash
# Python 3.11 설치
sudo yum install python3.11 -y

# 프로젝트 클론
git clone <REPO_URL>
cd hackerthon2_llm_1

# 패키지 설치
pip3.11 install -r requirements.txt

# AWS 자격증명 설정
mkdir -p .streamlit
cat > .streamlit/secrets.toml << EOF
[aws]
access_key_id = "..."
secret_access_key = "..."
region = "us-west-2"
EOF
```

### 3. Streamlit 실행

```bash
# 백그라운드 실행
nohup streamlit run app.py --server.port 8501 > streamlit.log 2>&1 &

# 로그 확인
tail -f streamlit.log
```

### 4. 외부 접속

```
http://<EC2_PUBLIC_IP>:8501
```

보안 그룹에서 8501 포트 열기:
- Type: Custom TCP
- Port: 8501
- Source: 0.0.0.0/0 (또는 심사위원 IP만)

---

## Error Handling

### Bedrock API 오류

```python
try:
    tool_calls = bedrock_client.stream_with_tools(...)
except botocore.exceptions.ClientError as e:
    error_code = e.response['Error']['Code']
    
    if error_code == 'ThrottlingException':
        st.error("요청이 너무 많습니다. 잠시 후 다시 시도하세요.")
    elif error_code == 'ValidationException':
        st.error("입력이 너무 깁니다. 메시지를 줄여주세요.")
    else:
        st.error(f"Bedrock 오류: {e}")
```

### 도구 호출 오류

```python
def execute(self, tool_call: dict) -> dict:
    try:
        # ... 도구 실행
    except LineNotFoundError as e:
        return {
            "error": f"줄 {e.line_id}를 찾을 수 없습니다. read_document()로 최신 줄 목록을 다시 읽어주세요."
        }
```

### 세션 복원 오류

```python
def load_sessions():
    try:
        with open('data/sessions.json') as f:
            return json.load(f)
    except FileNotFoundError:
        return []
    except json.JSONDecodeError:
        st.warning("세션 파일이 손상되어 초기화합니다.")
        return []
```

---

## Testing Strategy

### M0 검증

```bash
# Bedrock 연결 테스트
python bedrock_simple_test.py

# 기대 출력:
# ✓ Bedrock 연결 성공
# ✓ Claude 3 Sonnet 응답 수신
# ✓ 도구 호출 지원 확인
```

### M3 검증 (제안/승인)

```python
def test_proposal_flow():
    doc_core = DocumentCore()
    doc_core.lines = [
        Line(id='L1', line_order=0, content='원본 줄')
    ]
    
    # 제안
    doc_core.propose_replace('L1', '수정된 줄')
    assert doc_core.read()[0].content == '수정된 줄'
    assert doc_core.lines[0].content == '원본 줄'  # 실제는 안 바뀜
    
    # 적용
    doc_core.accept_proposal()
    assert doc_core.lines[0].content == '수정된 줄'
```

---

## Performance Considerations

- Bedrock 응답 시간: 2~5초 (스트리밍으로 체감 단축)
- 세션 로드: < 100ms (로컬 JSON 파일)
- diff 계산: < 50ms (줄 수 < 1000개 가정)
- FAISS 검색: < 200ms (인덱스 크기 < 10MB)

---

## Security

- AWS 자격증명은 `.streamlit/secrets.toml`에만 (git 제외)
- EC2 보안 그룹은 필요한 포트만 (8501, 22)
- 세션 데이터는 로컬 파일 (공유 금지)
- Bedrock 요청에 민감 정보 제외

---

## Next Steps (Post-Competition)

1. Track B 구현 (FastAPI + React)
2. PostgreSQL + Redis 도입
3. 멀티 사용자 인증
4. 이미지 첨부 (S3)
5. 민원서 양식 강제

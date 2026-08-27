# Tasks — 민원 작성 도우미

## M0: 대회 환경 검증

### TASK-001: Bedrock API 연결 테스트
**Depends on**: -
**Status**: OPEN
**Assigned to**: 

**Description**:
AWS Bedrock API 호출이 성공하는지, Claude 3 Sonnet이 도구 호출을 지원하는지 검증합니다.

**Acceptance Criteria**:
- [ ] `bedrock_simple_test.py` 파일 생성
- [ ] `boto3` 로 Bedrock Runtime 클라이언트 생성
- [ ] Claude 3 Sonnet 모델 ID로 텍스트 응답 수신
- [ ] 도구 호출 요청 시 `tool_use` 블록 반환 확인
- [ ] 성공/실패를 터미널에 출력

**Files to modify**:
- `bedrock_simple_test.py` (new)
- `requirements.txt`

**Implementation notes**:
```python
# bedrock_simple_test.py 예시
import boto3
import json

def test_bedrock_connection():
    bedrock = boto3.client('bedrock-runtime', region_name='us-west-2')
    
    # 1. 단순 텍스트 응답
    response = bedrock.invoke_model(
        modelId='anthropic.claude-3-sonnet-20240229-v1:0',
        body=json.dumps({
            "messages": [{"role": "user", "content": "Hello!"}],
            "max_tokens": 100
        })
    )
    print("✓ Bedrock 연결 성공")
    
    # 2. 도구 호출 지원 확인
    response = bedrock.invoke_model(
        modelId='anthropic.claude-3-sonnet-20240229-v1:0',
        body=json.dumps({
            "messages": [{"role": "user", "content": "현재 날씨 알려줘"}],
            "tools": [{
                "name": "get_weather",
                "description": "날씨 정보를 가져온다",
                "input_schema": {"type": "object", "properties": {}}
            }],
            "max_tokens": 100
        })
    )
    # tool_use 블록 확인
    print("✓ 도구 호출 지원 확인")

if __name__ == '__main__':
    test_bedrock_connection()
```

---

### TASK-002: EC2 인스턴스 설정 및 접속
**Depends on**: -
**Status**: OPEN
**Assigned to**: 

**Description**:
대회 제공 EC2 인스턴스에 SSH로 접속하고 기본 환경을 설정합니다.

**Acceptance Criteria**:
- [ ] 팀 키(`hackathon-{팀ID}-key.pem`) 다운로드 및 권한 설정
- [ ] SSH로 EC2 인스턴스 접속 성공
- [ ] Python 3.11 설치 확인
- [ ] git, pip 사용 가능 확인
- [ ] 보안 그룹에서 포트 8501 개방

**Commands**:
```bash
chmod 400 hackathon-{팀ID}-key.pem
ssh -i hackathon-{팀ID}-key.pem ec2-user@<PUBLIC_IP>

# EC2 내부
python3 --version  # 3.11+
git --version
pip3 --version
```

---

### TASK-003: 프로젝트 구조 생성
**Depends on**: -
**Status**: OPEN
**Assigned to**: 

**Description**:
Streamlit 앱에 필요한 디렉토리와 기본 파일을 생성합니다.

**Acceptance Criteria**:
- [ ] `app.py` 빈 파일 생성
- [ ] `lib/` 디렉토리 생성 (`__init__.py` 포함)
- [ ] `data/` 디렉토리 생성
- [ ] `.streamlit/secrets.toml.example` 생성
- [ ] `requirements.txt` 기본 패키지 명시
- [ ] `.gitignore`에 `.streamlit/secrets.toml`, `data/`, `*.pem` 추가

**Files to create**:
- `app.py`
- `lib/__init__.py`
- `lib/bedrock_client.py` (stub)
- `lib/document_core.py` (stub)
- `lib/tool_executor.py` (stub)
- `lib/proposal_manager.py` (stub)
- `requirements.txt`
- `.streamlit/secrets.toml.example`

**requirements.txt**:
```
streamlit==1.31.0
boto3==1.34.0
```

---

### TASK-004: Streamlit Hello World
**Depends on**: TASK-003
**Status**: OPEN
**Assigned to**: 

**Description**:
Streamlit 앱이 로컬과 EC2에서 정상 실행되는지 확인합니다.

**Acceptance Criteria**:
- [ ] `streamlit run app.py` 실행 시 브라우저가 열림
- [ ] "민원 작성 도우미" 제목 표시
- [ ] EC2에서 백그라운드 실행 (`nohup streamlit run app.py &`)
- [ ] 외부에서 `http://<EC2_IP>:8501` 접속 확인

**Files to modify**:
- `app.py`

**Implementation**:
```python
# app.py
import streamlit as st

st.set_page_config(page_title="민원 작성 도우미", layout="wide")
st.title("민원 작성 도우미")

st.write("Hello World!")
```

---

## M1: 기본 대화 (Track A)

### TASK-101: BedrockClient 구현
**Depends on**: TASK-001, TASK-003
**Status**: OPEN
**Assigned to**: 

**Description**:
Bedrock API를 호출하고 스트리밍 응답을 처리하는 클라이언트를 구현합니다.

**Acceptance Criteria**:
- [ ] `BedrockClient` 클래스 생성
- [ ] `stream_with_tools()` 메서드 구현
- [ ] 토큰이 도착할 때마다 callback 호출
- [ ] tool_use 블록을 수집해 반환
- [ ] AWS 자격증명을 `st.secrets`에서 읽기

**Files to modify**:
- `lib/bedrock_client.py`
- `.streamlit/secrets.toml.example`

**Implementation**:
```python
# lib/bedrock_client.py
import boto3
import json
import streamlit as st
from typing import List, Callable, Dict, Any

class BedrockClient:
    def __init__(self, model_id: str = "anthropic.claude-3-sonnet-20240229-v1:0"):
        self.bedrock = boto3.client(
            'bedrock-runtime',
            region_name=st.secrets.aws.region,
            aws_access_key_id=st.secrets.aws.access_key_id,
            aws_secret_access_key=st.secrets.aws.secret_access_key
        )
        self.model_id = model_id
    
    def stream_with_tools(
        self,
        messages: List[Dict],
        tools: List[Dict],
        callback: Callable[[str], None]
    ) -> List[Dict]:
        """
        스트리밍으로 응답을 받으면서 도구 호출을 수집.
        
        Args:
            messages: [{"role": "user", "content": "..."}]
            tools: 도구 정의 목록
            callback: 토큰마다 호출될 함수
            
        Returns:
            도구 호출 목록 (없으면 빈 리스트)
        """
        body = json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "messages": messages,
            "tools": tools,
            "max_tokens": 4096,
            "temperature": 0.7
        })
        
        response = self.bedrock.invoke_model_with_response_stream(
            modelId=self.model_id,
            body=body
        )
        
        tool_calls = []
        
        for event in response['body']:
            chunk = json.loads(event['chunk']['bytes'].decode())
            
            if chunk['type'] == 'content_block_start':
                if chunk.get('content_block', {}).get('type') == 'tool_use':
                    tool_calls.append({
                        'id': chunk['content_block']['id'],
                        'name': chunk['content_block']['name'],
                        'input': {}
                    })
            
            elif chunk['type'] == 'content_block_delta':
                delta = chunk['delta']
                
                if delta['type'] == 'text_delta':
                    callback(delta['text'])
                
                elif delta['type'] == 'input_json_delta':
                    # 도구 입력 누적
                    if tool_calls:
                        partial_json = delta.get('partial_json', '')
                        # JSON 파싱은 마지막에 한 번에
        
        return tool_calls
```

---

### TASK-102: 채팅 UI 구현
**Depends on**: TASK-004, TASK-101
**Status**: OPEN
**Assigned to**: 

**Description**:
Streamlit의 채팅 컴포넌트로 대화 UI를 만듭니다.

**Acceptance Criteria**:
- [ ] 왼쪽 패널에 채팅 영역 배치
- [ ] `st.chat_input()`으로 메시지 입력
- [ ] `st.chat_message()`로 대화 이력 표시
- [ ] 메시지를 `st.session_state.messages`에 저장
- [ ] 새로고침해도 이력 유지

**Files to modify**:
- `app.py`

**Implementation**:
```python
# app.py
import streamlit as st

# 초기화
if 'messages' not in st.session_state:
    st.session_state.messages = []

# 레이아웃
col1, col2 = st.columns([1, 1])

with col1:
    st.subheader("대화")
    
    # 이력 표시
    for msg in st.session_state.messages:
        with st.chat_message(msg['role']):
            st.write(msg['content'])
    
    # 입력
    user_input = st.chat_input("메시지를 입력하세요")
    
    if user_input:
        # 사용자 메시지 표시
        st.session_state.messages.append({
            'role': 'user',
            'content': user_input
        })
        st.rerun()

with col2:
    st.subheader("문서")
    st.write("(아직 구현 안 됨)")
```

---

### TASK-103: Bedrock 응답 스트리밍 연결
**Depends on**: TASK-101, TASK-102
**Status**: OPEN
**Assigned to**: 

**Description**:
사용자 메시지에 Bedrock으로 응답하고 스트리밍 토큰을 화면에 표시합니다.

**Acceptance Criteria**:
- [ ] 사용자 메시지 입력 시 Bedrock 호출
- [ ] 응답 토큰이 도착하는 대로 화면 갱신
- [ ] 응답 완료 시 `st.session_state.messages`에 저장
- [ ] 오류 발생 시 `st.error()` 표시

**Files to modify**:
- `app.py`

**Implementation**:
```python
# app.py (이어서)
from lib.bedrock_client import BedrockClient

if 'bedrock_client' not in st.session_state:
    st.session_state.bedrock_client = BedrockClient()

if user_input:
    st.session_state.messages.append({'role': 'user', 'content': user_input})
    
    with st.chat_message('user'):
        st.write(user_input)
    
    with st.chat_message('assistant'):
        response_placeholder = st.empty()
        full_response = ""
        
        def token_callback(token: str):
            nonlocal full_response
            full_response += token
            response_placeholder.markdown(full_response)
        
        try:
            tool_calls = st.session_state.bedrock_client.stream_with_tools(
                messages=st.session_state.messages,
                tools=[],  # 아직 도구 없음
                callback=token_callback
            )
            
            st.session_state.messages.append({
                'role': 'assistant',
                'content': full_response
            })
        
        except Exception as e:
            st.error(f"오류: {e}")
```

---

## M2: 문서 생성과 표시

### TASK-201: DocumentCore 구현
**Depends on**: TASK-003
**Status**: OPEN
**Assigned to**: 

**Description**:
문서를 줄 단위로 관리하고 제안 버퍼를 처리하는 코어 로직을 구현합니다.

**Acceptance Criteria**:
- [ ] `Line` dataclass 정의 (id, line_order, content, is_temp)
- [ ] `Edit` dataclass 정의 (type, line_id, texts 등)
- [ ] `DocumentCore` 클래스 생성
- [ ] `read()` 메서드: 제안 반영된 가상 뷰 반환
- [ ] `propose_replace()`, `propose_insert()`, `propose_delete()` 구현
- [ ] `calculate_diff()`: 텍스트 diff 생성
- [ ] `accept_proposal()`, `reject_proposal()` 구현

**Files to modify**:
- `lib/document_core.py`

**Implementation**: (design.md의 DocumentCore 참조)

---

### TASK-202: 문서 패널 UI
**Depends on**: TASK-102, TASK-201
**Status**: OPEN
**Assigned to**: 

**Description**:
오른쪽 패널에 문서를 마크다운으로 표시합니다.

**Acceptance Criteria**:
- [ ] `st.session_state.doc_core` 초기화
- [ ] 오른쪽 칸에 문서 내용 표시 (`st.markdown()`)
- [ ] 줄이 없으면 "아직 문서가 없습니다" 메시지
- [ ] 다운로드 버튼 (`st.download_button()`)
- [ ] `.md` 파일로 내보내기

**Files to modify**:
- `app.py`

**Implementation**:
```python
# app.py (오른쪽 패널)
from lib.document_core import DocumentCore

if 'doc_core' not in st.session_state:
    st.session_state.doc_core = DocumentCore()

with col2:
    st.subheader("문서")
    
    lines = st.session_state.doc_core.read()
    
    if not lines:
        st.info("아직 문서가 없습니다. 대화에서 '민원 문서로 작성해줘'라고 요청하세요.")
    else:
        doc_text = '\n'.join(line.content for line in lines)
        st.markdown(doc_text)
        
        st.download_button(
            label="📥 다운로드",
            data=doc_text,
            file_name="complaint.md",
            mime="text/markdown"
        )
```

---

### TASK-203: ToolExecutor 구현
**Depends on**: TASK-201
**Status**: OPEN
**Assigned to**: 

**Description**:
Bedrock 도구 호출을 DocumentCore 메서드로 라우팅하는 executor를 구현합니다.

**Acceptance Criteria**:
- [ ] `ToolExecutor` 클래스 생성
- [ ] `_define_tools()`: Bedrock 도구 스키마 정의
- [ ] `execute(tool_call)`: 도구 실행 및 결과 반환
- [ ] `read_document` 도구 구현
- [ ] `propose_replace_line`, `propose_insert_lines`, `propose_delete_lines` 구현
- [ ] `propose_replace_document` 구현
- [ ] 오류를 예외가 아니라 결과 dict에 담기

**Files to modify**:
- `lib/tool_executor.py`

**Implementation**: (design.md의 ToolExecutor 참조)

---

### TASK-204: 도구 호출 통합
**Depends on**: TASK-103, TASK-203
**Status**: OPEN
**Assigned to**: 

**Description**:
Bedrock이 반환한 도구 호출을 ToolExecutor로 실행하고 결과를 처리합니다.

**Acceptance Criteria**:
- [ ] `st.session_state.tool_executor` 초기화
- [ ] Bedrock 응답의 tool_calls를 ToolExecutor에 전달
- [ ] 도구 실행 결과를 다음 대화 맥락에 추가
- [ ] `read_document` 호출 시 문서 잠금 (`st.session_state.locked = True`)
- [ ] 도구 이름을 화면에 표시 (`st.info("read_document 호출 중...")`)

**Files to modify**:
- `app.py`

**Implementation**:
```python
# app.py (Bedrock 호출 부분)
from lib.tool_executor import ToolExecutor

if 'tool_executor' not in st.session_state:
    st.session_state.tool_executor = ToolExecutor(st.session_state.doc_core)

if user_input:
    # ... (이전과 동일)
    
    tool_calls = st.session_state.bedrock_client.stream_with_tools(
        messages=st.session_state.messages,
        tools=st.session_state.tool_executor.tools,
        callback=token_callback
    )
    
    # 도구 호출 처리
    if tool_calls:
        for tc in tool_calls:
            st.info(f"도구 호출: {tc['name']}")
            
            # 첫 read에서 잠금
            if tc['name'] == 'read_document':
                st.session_state.locked = True
            
            result = st.session_state.tool_executor.execute(tc)
            
            # 결과를 대화에 추가 (Claude는 tool_result를 요구)
            st.session_state.messages.append({
                'role': 'user',  # tool_result는 user role
                'content': [{
                    'type': 'tool_result',
                    'tool_use_id': tc['id'],
                    'content': json.dumps(result)
                }]
            })
```

---

## M3: 제안과 승인 (핵심)

### TASK-301: ProposalManager 구현
**Depends on**: TASK-201
**Status**: OPEN
**Assigned to**: 

**Description**:
제안의 TTL, 생성/처리 시점을 관리하는 매니저를 구현합니다.

**Acceptance Criteria**:
- [ ] `ProposalManager` 클래스 생성
- [ ] `has_proposal()`: 살아있는 제안이 있는지 (TTL 확인)
- [ ] `create_proposal()`: 제안 시작 시각 기록
- [ ] `clear_proposal()`: 제안 처리 완료
- [ ] 만료된 제안 자동 거절

**Files to modify**:
- `lib/proposal_manager.py`

**Implementation**: (design.md의 ProposalManager 참조)

---

### TASK-302: diff 표시 UI
**Depends on**: TASK-202, TASK-301
**Status**: OPEN
**Assigned to**: 

**Description**:
제안이 생기면 화면 하단에 diff를 표시합니다.

**Acceptance Criteria**:
- [ ] `st.session_state.proposal_manager` 초기화
- [ ] 제안 버퍼가 비지 않으면 diff 계산
- [ ] `st.expander("제안 대기 중")`로 diff 표시
- [ ] 추가 줄은 `🟢 +`, 삭제 줄은 `🔴 −`로 구분
- [ ] "적용" / "취소" 버튼 배치

**Files to modify**:
- `app.py`

**Implementation**:
```python
# app.py (문서 패널 아래)
from lib.proposal_manager import ProposalManager

if 'proposal_manager' not in st.session_state:
    st.session_state.proposal_manager = ProposalManager()

pm = st.session_state.proposal_manager

if pm.has_proposal(st.session_state.doc_core):
    with st.expander("📝 제안 대기 중", expanded=True):
        diff = st.session_state.doc_core.calculate_diff()
        
        for line in diff:
            if line.startswith('+'):
                st.markdown(f"🟢 **{line}**")
            elif line.startswith('-'):
                st.markdown(f"🔴 ~~{line}~~")
            else:
                st.write(line)
        
        col_a, col_b = st.columns(2)
        
        with col_a:
            if st.button("✓ 적용", type="primary"):
                # TASK-303에서 구현
                pass
        
        with col_b:
            if st.button("✗ 취소"):
                # TASK-303에서 구현
                pass
```

---

### TASK-303: 적용/취소 버튼 구현
**Depends on**: TASK-302
**Status**: OPEN
**Assigned to**: 

**Description**:
제안을 적용하거나 거절하는 버튼 동작을 구현합니다.

**Acceptance Criteria**:
- [ ] "적용" 버튼: `doc_core.accept_proposal()` 호출
- [ ] 적용 시 되돌리기 스택에 스냅샷 추가
- [ ] 적용 결과를 대화에 기록 (`role='note'`)
- [ ] "취소" 버튼: `doc_core.reject_proposal()` 호출
- [ ] 거절 결과를 대화에 기록
- [ ] 둘 다 잠금 해제 (`st.session_state.locked = False`)
- [ ] `st.rerun()`으로 UI 갱신

**Files to modify**:
- `app.py`

**Implementation**:
```python
# app.py (제안 버튼 부분)

if 'undo_stack' not in st.session_state:
    st.session_state.undo_stack = []
if 'redo_stack' not in st.session_state:
    st.session_state.redo_stack = []

with col_a:
    if st.button("✓ 적용", type="primary"):
        # 되돌리기 스택에 추가
        snapshot = st.session_state.doc_core.accept_proposal()
        st.session_state.undo_stack.append(snapshot)
        st.session_state.redo_stack.clear()
        
        # 제안 정리
        st.session_state.proposal_manager.clear_proposal()
        st.session_state.locked = False
        
        # 결과 기록
        st.session_state.messages.append({
            'role': 'note',
            'content': '제안이 적용되었습니다.'
        })
        
        st.rerun()

with col_b:
    if st.button("✗ 취소"):
        st.session_state.doc_core.reject_proposal()
        st.session_state.proposal_manager.clear_proposal()
        st.session_state.locked = False
        
        st.session_state.messages.append({
            'role': 'note',
            'content': '제안이 거절되었습니다.'
        })
        
        st.rerun()
```

---

### TASK-304: 잠금 UI 표시
**Depends on**: TASK-302
**Status**: OPEN
**Assigned to**: 

**Description**:
제안 대기 중에는 채팅 입력과 문서 편집을 막습니다.

**Acceptance Criteria**:
- [ ] `st.session_state.locked == True`이면 채팅 입력 비활성화
- [ ] 문서 편집 텍스트 영역 비활성화
- [ ] 잠금 사유를 화면 상단에 표시 (`st.warning()`)
- [ ] 제안 처리 시 잠금 자동 해제

**Files to modify**:
- `app.py`

**Implementation**:
```python
# app.py (채팅 입력 부분)

# 잠금 상태 표시
if st.session_state.get('locked'):
    st.warning("⚠️ 제안을 처리해야 합니다. 적용 또는 취소를 선택하세요.")

# 채팅 입력 (잠금 시 비활성화)
user_input = st.chat_input(
    "메시지를 입력하세요",
    disabled=st.session_state.get('locked', False)
)
```

---

## M4: 사용자 편집

### TASK-401: 문서 편집 텍스트 영역
**Depends on**: TASK-202
**Status**: OPEN
**Assigned to**: 

**Description**:
사용자가 문서를 직접 수정할 수 있는 텍스트 영역을 추가합니다.

**Acceptance Criteria**:
- [ ] "편집 모드" 토글 버튼
- [ ] 편집 모드에서 `st.text_area()` 표시
- [ ] 텍스트 영역에 현재 문서 내용 로드
- [ ] "저장" 버튼으로 변경사항 반영
- [ ] 줄 단위로 파싱해 `doc_core.lines` 갱신
- [ ] 잠금 중에는 편집 불가

**Files to modify**:
- `app.py`

**Implementation**:
```python
# app.py (문서 패널)

edit_mode = st.toggle("편집 모드", disabled=st.session_state.get('locked'))

if edit_mode:
    doc_text = '\n'.join(line.content for line in st.session_state.doc_core.lines)
    
    edited_text = st.text_area(
        "문서 편집",
        value=doc_text,
        height=400
    )
    
    if st.button("💾 저장"):
        # 줄 단위로 파싱
        new_lines = [
            Line(id=str(uuid4()), line_order=i, content=content)
            for i, content in enumerate(edited_text.split('\n'))
        ]
        
        # 되돌리기 스택에 추가
        snapshot = Snapshot(lines=st.session_state.doc_core.lines.copy())
        st.session_state.undo_stack.append(snapshot)
        st.session_state.redo_stack.clear()
        
        # 문서 갱신
        st.session_state.doc_core.lines = new_lines
        st.rerun()
else:
    # 읽기 전용 표시
    doc_text = '\n'.join(line.content for line in st.session_state.doc_core.lines)
    st.markdown(doc_text)
```

---

### TASK-402: 실행취소/다시실행 버튼
**Depends on**: TASK-303, TASK-401
**Status**: OPEN
**Assigned to**: 

**Description**:
문서 변경을 되돌리거나 복구하는 버튼을 추가합니다.

**Acceptance Criteria**:
- [ ] "↶ 실행취소" 버튼 (undo_stack이 비지 않을 때만 활성화)
- [ ] "↷ 다시실행" 버튼 (redo_stack이 비지 않을 때만 활성화)
- [ ] 실행취소: 스택에서 스냅샷을 꺼내 문서 복원
- [ ] 다시실행: redo_stack에서 꺼내 적용
- [ ] 잠금 중에는 버튼 비활성화

**Files to modify**:
- `app.py`

**Implementation**:
```python
# app.py (문서 패널, 다운로드 버튼 옆)

col_undo, col_redo = st.columns(2)

with col_undo:
    if st.button(
        "↶ 실행취소",
        disabled=not st.session_state.undo_stack or st.session_state.get('locked')
    ):
        snapshot = st.session_state.undo_stack.pop()
        
        # 현재 상태를 redo에 추가
        redo_snapshot = Snapshot(lines=st.session_state.doc_core.lines.copy())
        st.session_state.redo_stack.append(redo_snapshot)
        
        # 복원
        st.session_state.doc_core.lines = snapshot.lines
        st.rerun()

with col_redo:
    if st.button(
        "↷ 다시실행",
        disabled=not st.session_state.redo_stack or st.session_state.get('locked')
    ):
        snapshot = st.session_state.redo_stack.pop()
        
        # 현재 상태를 undo에 추가
        undo_snapshot = Snapshot(lines=st.session_state.doc_core.lines.copy())
        st.session_state.undo_stack.append(undo_snapshot)
        
        # 복원
        st.session_state.doc_core.lines = snapshot.lines
        st.rerun()
```

---

## M5: 대회 제출

### TASK-501: TEAM_GUIDE.html 작성
**Depends on**: -
**Status**: OPEN
**Assigned to**: 

**Description**:
팀 인프라 구축 및 배포 가이드 문서를 작성합니다.

**Acceptance Criteria**:
- [ ] HTML 파일 생성
- [ ] 팀 정보 (팀명, 팀원, 역할)
- [ ] 프로젝트 개요 및 아키텍처
- [ ] 로컬 실행 방법
- [ ] EC2 배포 방법
- [ ] Bedrock 사용량 모니터링 방법
- [ ] 트러블슈팅 가이드

**Files to create**:
- `TEAM_GUIDE.html`

---

### TASK-502: README.md 업데이트
**Depends on**: -
**Status**: OPEN
**Assigned to**: 

**Description**:
프로젝트 루트의 README를 대회용으로 업데이트합니다.

**Acceptance Criteria**:
- [ ] 프로젝트 제목 및 설명
- [ ] 핵심 기능 (제안/승인 흐름 강조)
- [ ] 기술 스택 (Bedrock, Streamlit)
- [ ] 실행 방법 (로컬 + EC2)
- [ ] 데모 시나리오 (스크린샷)
- [ ] 팀 정보

**Files to modify**:
- `README.md`

---

### TASK-503: 세션 로컬 저장
**Depends on**: TASK-102
**Status**: OPEN
**Assigned to**: 

**Description**:
세션 데이터를 `data/sessions.json`에 저장하고 복원합니다.

**Acceptance Criteria**:
- [ ] 앱 시작 시 `data/sessions.json` 로드
- [ ] 세션이 없으면 빈 리스트로 초기화
- [ ] 메시지 추가 시 자동 저장
- [ ] 문서 변경 시 자동 저장
- [ ] JSON 직렬화 가능한 형태로 변환

**Files to modify**:
- `app.py`
- `lib/storage.py` (new)

**Implementation**:
```python
# lib/storage.py
import json
from pathlib import Path

DATA_DIR = Path('data')
DATA_DIR.mkdir(exist_ok=True)

def save_sessions(sessions: list):
    with open(DATA_DIR / 'sessions.json', 'w') as f:
        json.dump(sessions, f, indent=2, ensure_ascii=False)

def load_sessions() -> list:
    path = DATA_DIR / 'sessions.json'
    if not path.exists():
        return []
    
    with open(path) as f:
        return json.load(f)
```

---

### TASK-504: EC2 배포 스크립트
**Depends on**: TASK-004
**Status**: OPEN
**Assigned to**: 

**Description**:
EC2에서 한 번에 배포할 수 있는 스크립트를 작성합니다.

**Acceptance Criteria**:
- [ ] `deploy.sh` 파일 생성
- [ ] git clone, pip install 자동화
- [ ] secrets.toml 생성 가이드
- [ ] nohup으로 백그라운드 실행
- [ ] 로그 확인 명령 포함

**Files to create**:
- `deploy.sh`

**Implementation**:
```bash
#!/bin/bash
# deploy.sh

set -e

echo "=== 민원 작성 도우미 배포 스크립트 ==="

# 1. 패키지 설치
echo "패키지 설치 중..."
pip3 install -r requirements.txt

# 2. secrets.toml 확인
if [ ! -f .streamlit/secrets.toml ]; then
    echo "ERROR: .streamlit/secrets.toml 파일이 없습니다."
    echo "secrets.toml.example을 복사해 AWS 자격증명을 입력하세요."
    exit 1
fi

# 3. 데이터 디렉토리 생성
mkdir -p data

# 4. Streamlit 실행
echo "Streamlit 실행 중..."
nohup streamlit run app.py --server.port 8501 > streamlit.log 2>&1 &

echo "배포 완료!"
echo "접속 주소: http://$(curl -s ifconfig.me):8501"
echo "로그 확인: tail -f streamlit.log"
```

---

### TASK-505: Bedrock 사용량 모니터링
**Depends on**: TASK-101
**Status**: OPEN
**Assigned to**: 

**Description**:
Bedrock API 호출 횟수와 토큰 사용량을 로깅합니다.

**Acceptance Criteria**:
- [ ] 각 Bedrock 호출 시 로그 기록
- [ ] 호출 시각, 모델 ID, 입력/출력 토큰 수 기록
- [ ] `data/bedrock_usage.log` 파일에 추가
- [ ] 누적 토큰 수를 화면에 표시

**Files to modify**:
- `lib/bedrock_client.py`
- `app.py` (사이드바에 통계 표시)

**Implementation**:
```python
# lib/bedrock_client.py (로깅 추가)
import logging

logging.basicConfig(
    filename='data/bedrock_usage.log',
    level=logging.INFO,
    format='%(asctime)s - %(message)s'
)

class BedrockClient:
    def stream_with_tools(self, ...):
        input_tokens = sum(len(m['content'].split()) for m in messages)  # 근사치
        
        logging.info(f"Bedrock 호출 - 모델: {self.model_id}, 입력 토큰: ~{input_tokens}")
        
        # ... (기존 로직)
        
        output_tokens = len(full_response.split())
        logging.info(f"Bedrock 응답 - 출력 토큰: ~{output_tokens}")
```

---

## M6: RAG 통합 (선택)

### TASK-601: 민원 양식 샘플 수집
**Depends on**: -
**Status**: OPEN
**Assigned to**: 

**Description**:
민원서 양식 예시 3~5개를 마크다운으로 작성합니다.

**Acceptance Criteria**:
- [ ] `data/samples/` 디렉토리 생성
- [ ] 각 샘플을 `.md` 파일로 저장
- [ ] 제목, 발생 일시, 상황 설명, 요청 사항 포함

**Files to create**:
- `data/samples/complaint_1.md`
- `data/samples/complaint_2.md`
- `data/samples/complaint_3.md`

---

### TASK-602: FAISS 인덱싱
**Depends on**: TASK-601
**Status**: OPEN
**Assigned to**: 

**Description**:
민원 샘플을 FAISS로 인덱싱하는 스크립트를 작성합니다.

**Acceptance Criteria**:
- [ ] `bedrock_faiss_indexer.py` 파일 생성
- [ ] Bedrock Embeddings로 벡터 생성
- [ ] FAISS 인덱스에 저장 (`faiss_index/index.faiss`)
- [ ] 메타데이터 JSON 저장 (파일명, 내용)
- [ ] 인덱싱 성공 메시지 출력

**Files to create**:
- `bedrock_faiss_indexer.py`

**Implementation**:
```python
# bedrock_faiss_indexer.py
import boto3
import json
import faiss
import numpy as np
from pathlib import Path

def index_samples():
    bedrock = boto3.client('bedrock-runtime')
    
    # 샘플 로드
    samples = []
    for path in Path('data/samples').glob('*.md'):
        with open(path) as f:
            samples.append({
                'filename': path.name,
                'content': f.read()
            })
    
    # 임베딩 생성
    embeddings = []
    for sample in samples:
        response = bedrock.invoke_model(
            modelId='amazon.titan-embed-text-v1',
            body=json.dumps({"inputText": sample['content']})
        )
        result = json.loads(response['body'].read())
        embeddings.append(result['embedding'])
    
    # FAISS 인덱스 생성
    dim = len(embeddings[0])
    index = faiss.IndexFlatL2(dim)
    index.add(np.array(embeddings).astype('float32'))
    
    # 저장
    Path('faiss_index').mkdir(exist_ok=True)
    faiss.write_index(index, 'faiss_index/index.faiss')
    
    with open('faiss_index/metadata.json', 'w') as f:
        json.dump(samples, f, ensure_ascii=False)
    
    print(f"✓ {len(samples)}개 샘플 인덱싱 완료")

if __name__ == '__main__':
    index_samples()
```

---

### TASK-603: RAG 검색 통합
**Depends on**: TASK-602, TASK-204
**Status**: OPEN
**Assigned to**: 

**Description**:
사용자 메시지를 바탕으로 유사 샘플을 검색해 프롬프트에 포함합니다.

**Acceptance Criteria**:
- [ ] `bedrock_faiss_rag_chatbot.py` 파일 생성
- [ ] 사용자 메시지로 임베딩 생성
- [ ] FAISS에서 top-k 검색 (k=2)
- [ ] 검색 결과를 시스템 프롬프트에 추가
- [ ] "참고: 유사 사례 2건" UI 표시

**Files to create**:
- `bedrock_faiss_rag_chatbot.py`

**Files to modify**:
- `app.py` (RAG 검색 추가)

---

## 완료 기준

모든 태스크가 완료되고 아래 조건을 만족하면 대회 제출 준비 완료:

- [ ] M0~M4 태스크 전부 COMPLETE
- [ ] EC2 공개 IP로 외부 접속 가능
- [ ] 제안/승인 흐름 데모 가능
- [ ] `TEAM_GUIDE.html` 작성 완료
- [ ] README에 실행 방법 명시
- [ ] Bedrock 사용량 로그 확인 가능

---

## 우선순위

**P0 (필수)**: M0 전체, M1~M3 전체
**P1 (중요)**: M4 전체, M5 (TASK-501, 502, 503)
**P2 (선택)**: M5 (TASK-504, 505), M6 전체

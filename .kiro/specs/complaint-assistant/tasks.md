# Implementation Plan: UniVoice

## Overview

38개 태스크를 M0(환경 검증)~M5(대회 제출) 6단계로 나눈다. 각 태스크는 `requirements.md`의 요구사항 번호를 참조한다. 스키마 DDL은 `requirements.md`의 Data Model 절이 정본이며, 여기서는 그것을 그대로 적용하라고만 지시한다 (같은 내용을 두 곳에 적으면 반드시 갈라진다).

## Task Dependency Graph

```
M0 (환경 검증)
 1 Bedrock 연결 실측
 2 EC2 접속·환경 확인
 3 프로젝트 구조 + 스키마 초기화 ──depends on── 1,2
 4 학교/도메인/코드 시드 ──depends on── 3

M1 (계정 & 학교)
 5 repo: 계정/학교 ──depends on── 4
 6 auth_service: 가입/로그인/세션 ──depends on── 5
 7 deps: 인증/역할/소유권 ──depends on── 6

M2 (AI 민원 변환)
 8 llm 계층: 도구 둘 + tool_choice=any ──depends on── 1
 9 session_service: 대화 왕복·칩·턴 잠금 ──depends on── 8,5
 10 세션 컨테이너: 목록·압축 ──depends on── 9
 11 정식 접수 트랜잭션 ──depends on── 10

M3 (게시판 & 철회)
 12 학생 게시판 ──depends on── 11
 13 민원 철회 ──depends on── 12

M4 (관리자 대시보드)
 14 repo: 상태 전이 (UPDATE...WHERE) ──depends on── 12
 15 ComplaintService 전이 래핑 ──depends on── 14
 16 통계·필터 ──depends on── 7,12
 17 목록·상세 (자동 확인) ──depends on── 15,16
 18 결정 버튼 (수락/보류/거절) ──depends on── 17
 19 처리중→해결완료 ──depends on── 18
 20 코멘트 상시 입력 ──depends on── 15,17

M5 (대회 제출)
 21 TEAM_GUIDE 갱신
 22 README 갱신
 23 DB 백업 스크립트 ──depends on── 3
 24 EC2 배포 스크립트 ──depends on── 6
 25 Bedrock 사용량 로깅 ──depends on── 8
```

## Tasks

- [ ] 1. Bedrock API 연결 실측
  - `bedrock_simple_test.py`로 `global.anthropic.claude-sonnet-5` 텍스트 응답 수신 확인
  - `boto3.client('bedrock-runtime')` 호출 시 리전을 지정하지 않음 (Instance Profile이 자동 처리)
  - 도구 호출(`tool_choice` auto) 요청 시 `tool_use` 블록 반환 확인
  - 도구를 호출하지 않고 텍스트로만 답하는 경우도 확인 (되묻기 시나리오 사전 검증)
  - _Requirements: 2.1, 2.2_

- [ ] 2. EC2 인스턴스 설정 및 접속 확인
  - `hackathon-e1-t01-key.pem`으로 SSH 접속 성공 확인
  - Python 3.11+, git, pip 사용 가능 확인
  - 보안 그룹에서 포트 8501 개방 확인
  - _Requirements: 5.2_

- [ ] 3. 프로젝트 구조 생성 및 PostgreSQL 스키마 초기화
  - `docs/backend-design.md` §2의 모듈 구성대로 디렉토리 생성: `app/{main.py, api/{deps.py,routes/}, schemas/, services/, repo/, session/, llm/, core/}`
  - `frontend/` 디렉토리 생성 (정적 파일, `app/main.py`가 API 라우터 등록 뒤에 mount)
  - `requirements.txt` 작성: `fastapi`, `uvicorn[standard]`, `psycopg[binary,pool]`, `redis`, `boto3`, `bcrypt`
  - `.gitignore`에 `*.pem`, `.env` 추가
  - `init_db.py` 작성: `requirements.md`의 PostgreSQL Schema 절을 그대로 적용해 7개 테이블(`schools`, `admin_codes`, `users`, `chat_sessions`, `complaints`, `complaint_conversations`, `complaint_comments`) + `bedrock_logs` 생성
  - `complaints.status` CHECK 제약이 7종(`미확인`,`확인`,`처리중`,`해결완료`,`보류`,`거절`,`철회`)을 포함하는지 확인
  - `complaint_conversations`의 두 FK — `chat_session_id` SET NULL, `complaint_id` CASCADE — 확인
  - `chat_sessions.context`·`compacted_upto`·`is_manual_title`, `schools.aliases TEXT[]` 존재 확인
  - _Requirements: 1.8, 2.9, 2.1.5, Data Model_

- [ ] 4. 학교/도메인/관리자코드 시드 스크립트
  - `seed_schools.py` 작성: 학교 이름·이메일 도메인·별칭·관리자 코드를 시드 (최소 2개 학교, 교차 격리 데모용)
  - `ON CONFLICT`로 재실행해도 중복 삽입되지 않게 함 (배포 스크립트가 매번 호출)
  - _Requirements: 1.1, 1.6_

- [ ] 5. repo 계층 — 계정/학교
  - `school_repo.find_by_domain(conn, domain)` 구현 — 없으면 `None`
  - `school_repo.list_all(conn)` 구현 — 별칭 포함 (가입 드롭다운용)
  - `school_repo.verify_admin_code(conn, school_id, code)` 구현
  - `user_repo.create/find_by_email/get_hash/change_password/delete` 구현
  - 모든 조회 함수가 `school_id`를 필수 인자로 받도록 시그니처 강제
  - 이메일은 소문자로 정규화해 저장·조회
  - _Requirements: 1.1, 1.2, 1.3, 1.6_

- [ ] 6. auth_service — 가입·로그인·세션
  - `signup(email, password, admin_code)` 구현 — 코드가 비면 `student`, 일치하면 `admin`, 불일치하면 `INVALID_ADMIN_CODE`로 가입 차단
  - 이메일 중복 시 `EMAIL_TAKEN`(409) 반환
  - bcrypt 해싱 적용, 평문을 로그에 남기지 않음
  - `login` 구현 — 계정이 없어도 더미 해시를 대조하고 401 (응답 속도로 계정 존재 여부가 새지 않게)
  - "이메일 없음"과 "비밀번호 틀림"을 구분하지 않고 동일하게 `INVALID_CREDENTIALS` 반환
  - `login_session.create/get/delete` 구현 (Redis). `get`은 TTL 연장(sliding)
  - 쿠키 속성 `HttpOnly`·`SameSite=Lax` 적용
  - `verify_password(user_id, password)` 구현 — 아무것도 바꾸지 않음. 실패 횟수 제한 적용
  - _Requirements: 1.3, 1.4, 1.5, 1.6, 1.9, 1.10_

- [ ] 7. deps — 인증·역할·소유권
  - `current_user` 의존성 구현 — 쿠키 → Redis 조회, 없으면 401 `UNAUTHENTICATED`
  - `require_admin` 구현 — 학생이 부르면 403 `FORBIDDEN_ROLE`
  - `require_session_owner(sid, user_id)` 구현 — 남의 세션이면 404 (403이 아님, 존재 자체를 노출하지 않기 위함)
  - 초안·작성 API는 관리자가 부르면 403이 되도록 라우터에 의존성 적용
  - 인증 판단을 라우터에 직접 작성하지 않고 전부 `Depends`로 주입
  - _Requirements: 1.8, 2.1.10_

- [ ] 8. llm 계층 — 도구 둘로 부족을 판정
  - `CATEGORIES` 고정 7종, `DETAIL_CHIPS` 카테고리별 고정 칩 정의 (`llm/choices.py`)
  - `ASK_FOLLOWUP` 스키마 정의 — `missing`(enum) · `question` · `choices[]`
  - `CLASSIFY_AND_REFINE` 스키마 정의 — `category`(enum) · `location` · `refined_title` · `refined_body` · `session_title`
  - `tool_choice: {"type": "any"}`로 둘 중 하나를 반드시 부르게 강제
  - `invoke_model` + Anthropic 네이티브 포맷 구현, 리전 미지정
  - 모델 id를 `core/config.py`에서 읽도록 구성 (`global.` 프로필)
  - `system` 필드에 세션주제를 넣고 `messages`에는 끼우지 않음
  - `user` 발화 연속 시 합쳐 보내는 로직 구현 (이전 턴이 LLM 실패로 끝난 경우)
  - `tool_use` 블록이 여럿이면 첫 번째만 사용
  - `refine(context, buffer) -> RefineResult`, `compact(prev_context, messages) -> CompactResult` 구현
  - `llm` 계층이 `repo`를 호출하지 않도록 함 — 결과를 `Usage`로 반환하고 적재는 서비스가 수행
  - `AccessDenied`는 재시도하지 않음, `Throttling`만 1회 backoff
  - _Requirements: 2.1, 2.2, 2.4, Category Taxonomy_

- [ ] 9. session_service — 대화 왕복·칩·턴 잠금
  - `send_message(session_id, text)` 구현 — 학생 발화를 먼저 저장(LLM 실패해도 남도록)
  - 맥락 조립: `context`(세션주제) + `compacted_upto` 이후 버퍼
  - LLM 호출 전에 DB 커넥션 반납 (수 초 붙들면 풀이 마름)
  - `turn:{sid}:running`을 `SET NX`로 세움, 이미 있으면 409 `TURN_IN_PROGRESS`
  - `finally`로 반드시 해제 (실패로 끝나도)
  - `ask_followup`이면 칩 병합 — 카테고리는 고정 7종만, 나머지는 고정+모델, 끝에 "직접 입력"
  - 칩을 `complaint_conversations.choices`에 함께 저장 (Redis는 캐시일 뿐)
  - 같은 `missing`이 2회 반복되면 예시 덧붙임, 4회면 409 `CONVERSATION_STUCK`
  - 공백·2000자 초과·직전과 동일한 발화는 모델을 부르지 않고 걸러냄
  - 확정 턴이면 `refined_json`을 같은 행에 저장하고 `chat_sessions`의 제목·카테고리 갱신
  - `bedrock_logs` 적재를 이 계층에서 수행 (`school_id`는 `chat_sessions`에서 조회)
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ] 10. 세션 컨테이너 — 목록·압축
  - `POST /chat-sessions` 구현 — 세션 행 생성, 빈 세션이 이미 있으면 재사용 (연타 방지)
  - `GET /chat-sessions` 구현 — `user_id`로 필터, 메시지 없는 세션은 제외, 최신순
  - `GET /chat-sessions/{sid}` 구현 — 메타 + 현재 단계 + 칩 + 미리보기
  - 압축 로직: 미압축 분량이 임계치를 넘으면 턴 응답을 보낸 뒤 백그라운드로 실행
  - 대상 구간을 시작 시점에 고정하고 갱신 SQL에 `WHERE compacted_upto = from` 조건 적용
  - 새 세션주제 = 압축(이전 세션주제 + 밀려난 구간) — 누적 압축 구현
  - 최근 N턴은 압축 대상에서 제외
  - 압축 프롬프트에 "확정된 항목은 그대로 옮겨 적어라" 지시 포함
  - `compact:{sid}`를 `SET NX`로 잠금
  - 압축 실패 시 기존 값 유지 + 다음 턴 재시도, 턴 응답에는 영향 없음
  - `is_manual_title=TRUE`면 자동 갱신이 제목을 덮어쓰지 않도록 함
  - _Requirements: 2.1.1, 2.1.2, 2.1.3, 2.1.4, 2.1.5, 2.1.6, 2.1.7_

- [ ] 11. 정식 접수 — 한 트랜잭션에 넷
  - 마지막 `refined_json` 조회, 없으면 409 `DRAFT_NOT_COMPLETE`
  - 이미 접수된 세션이면 409 `SESSION_CLOSED`
  - 한 트랜잭션으로 ① `complaints` INSERT ② 대화에 `complaint_id` 채움 ③ `chat_sessions.complaint_id` 채움(읽기 전용화) ④ 다음 세션 발급
  - `school_id`·작성자를 세션 행에서 가져옴 (요청 본문에서 받지 않음)
  - 응답에 `complaint_id`와 `next_session_id` 포함
  - 확정안을 요청 본문으로 받지 않도록 구현 (서버가 저장된 마지막 확정안을 사용)
  - 프론트가 "이대로 접수하시겠습니까?" 확인창을 거친 뒤에만 호출하도록 연동
  - _Requirements: 2.6, 2.7, 2.8, 2.9, 2.1.8_

- [ ] 12. 학생 게시판 (school_id 스코프)
  - `list_complaints(school_id)`가 항상 `school_id` WHERE 조건을 포함하도록 구현
  - `status != '철회'`인 항목만 반환
  - 카테고리/위치/제목/본문/접수시각/상태 배지 표시 (6가지 상태 색상 구분)
  - "대화 원문 보기" 토글로 `complaint_conversations` 전체를 시간순 표시
  - `get_comments(complaint_id)`로 관리자 코멘트 표시 (`is_hold_reason=True`는 "보류 사유"로 강조)
  - `is_mine`을 서버가 계산해 응답에 포함, `submitted_by_user_id`는 절대 노출하지 않음
  - _Requirements: 2.10, 2.15, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [ ] 13. 민원 철회 (비밀번호 재확인, 3단계)
  - `is_mine === true`인 항목에만 철회 버튼 표시
  - 1단계: 경고 + 비밀번호 입력 폼
  - `verify_password` 실패 시 창을 유지한 채 오류 표시, 다음 단계로 진행하지 않음
  - 2단계: 비밀번호 일치 시 "정말 삭제하시겠습니까?" 최종 확인창
  - 3단계: 확인 시 `withdraw(complaint_id, user_id, password)` 호출 → `status='철회'`, "삭제되었습니다" 알림
  - `withdraw_complaint`가 `submitted_by_user_id` 일치 조건을 WHERE에 포함 (타인 글 철회 방어)
  - 철회 성공 시 게시판·관리자 목록 양쪢에서 사라지도록 목록·통계 재조회
  - _Requirements: 2.11, 2.12, 2.13, 2.14, 2.15_

- [ ] 14. repo 계층 — 상태 전이 (UPDATE ... WHERE)
  - `confirm_complaint(id, school_id)` — `WHERE status='미확인'` 조건으로 `확인`+`confirmed_at` 갱신, 조건 불일치 시 무동작(재호출 안전)
  - `accept_complaint(id, school_id) -> bool` — `WHERE status='확인'` 조건으로 `처리중` 전환
  - `resolve_complaint(id, school_id) -> bool` — `WHERE status='처리중'` 조건으로 `해결완료` 전환
  - `hold_complaint(id, school_id, author_user_id, reason) -> bool` — `WHERE status='확인'` 조건으로 `보류` 전환 + 같은 트랜잭션에서 코멘트 삽입 (`is_hold_reason=true`), 실패 시 rollback
  - `reject_complaint(id, school_id) -> bool` — `WHERE status='확인'` 조건으로 `거절` 전환
  - `add_comment(complaint_id, author_user_id, content)` — 상태 무관 항상 삽입
  - `get_comments(complaint_id)`, `get_complaint(id, school_id)` 구현
  - _Requirements: 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 4.12, 4.13, 4.16_

- [ ] 15. ComplaintService 상태 전이 래핑
  - `open_detail(complaint_id, school_id)` — `confirm_complaint()` 호출, 반환값 없음(사이드이펙트만)
  - `accept/resolve/reject(complaint_id, school_id) -> (bool, str)` — 성공/실패 메시지 반환
  - `hold(complaint_id, school_id, author_user_id, reason) -> (bool, str)` — `reason.strip()`이 빈 문자열이면 DB 호출 없이 거부
  - `add_comment(complaint_id, author_user_id, content) -> (bool, str)` — 빈 값 검증
  - _Requirements: 4.11, 4.13_

- [ ] 16. 통계 카드 & 필터 탭
  - `get_complaint_stats(school_id)` 구현 — 전체 + 6상태, 철회 제외
  - 통계 카드 7개 렌더링 연동
  - 필터 탭 선택 시 `list_complaints(school_id, status=선택값)`로 목록 갱신
  - _Requirements: 4.1, 4.2_

- [ ] 17. 관리자 목록 테이블 & 상세 화면 (열람 시 자동 확인)
  - ID/분류·위치/제목/접수시각/상태 컬럼으로 목록 렌더링 (조치 버튼은 목록에 없음)
  - 행 클릭 시 상세 조회와 같은 요청 흐름에서 `open_detail(id, school_id)` 호출
  - 상세 화면에 학생-AI 대화 전체와 최종 카테고리/위치/제목/본문 표시
  - 상세를 다시 열어도(이미 확인 이후 상태) 에러 없이 정상 표시되는지 확인 (멱등성 검증)
  - 목록·상세 어디에도 철회 버튼이 없는지 확인 (관리자는 철회 불가)
  - _Requirements: 4.3, 4.4, 4.5, 4.6_

- [ ] 18. 결정 버튼 — 수락/보류/거절 (확인 상태에서만 노출)
  - `확인` 상태일 때만 [수락][보류][거절] 세 버튼 표시
  - "수락" 클릭 → `accept()` 호출 → 성공 시 `처리중`으로 전환, 목록·통계 재조회
  - "보류" 클릭 → 코멘트 입력 모달 오픈 (버튼 클릭 즉시 전환되지 않음)
  - 모달 입력창이 비면 "보류 확정" 버튼 비활성화 또는 제출 시 서비스가 거부하고 에러 표시
  - 모달에서 사유 입력 후 확정하면 `보류` 전환 + 코멘트 등록이 동시에 반영, 모달 닫힘
  - "거절" 클릭 → `reject()` 호출 → 즉시 `거절`로 전환 (코멘트 없이)
  - _Requirements: 4.7, 4.8, 4.11, 4.12_

- [ ] 19. 처리중 → 해결완료 전환
  - `처리중` 상태일 때만 [해결 완료] 버튼 표시
  - 클릭 → `resolve()` 호출 → 성공 시 `해결완료`로 전환
  - `해결완료` 도달 후에는 결정 버튼이 사라짐 (코멘트 입력창은 유지)
  - _Requirements: 4.9, 4.10_

- [ ] 20. 코멘트 상시 입력 (상태 무관)
  - 상세 화면 하단에 코멘트 목록(`get_comments`, 시간순)과 입력창을 항상 표시
  - `is_hold_reason=True`인 코멘트를 "보류 사유"로 시각적으로 구분
  - 입력 후 "등록" 클릭 → `add_comment()` 호출 → 목록 갱신
  - 모든 상태(`미확인`·`해결완료`·`거절` 포함)에서 코멘트 입력이 막히지 않는지 확인
  - _Requirements: 4.13_

- [ ] 21. TEAM_GUIDE.html 최신화
  - 데모 절차 추가: 학생 가입(도메인 이메일) → 민원 대화 작성 → 접수 → 관리자 가입(코드 입력) → 상태 변경 → 학생 게시판 확인 → 철회 시연
  - 시드된 데모 학교/도메인/관리자 코드 값 명시
  - _Requirements: 5.2_

- [ ] 22. README.md 업데이트
  - 서비스 개요(학교별 익명 민원 + AI 대화형 정제) 작성
  - 기술 스택(Bedrock, FastAPI, PostgreSQL, Redis) 명시
  - 실행 방법 작성: PostgreSQL·Redis 기동 → `init_db.py` → `seed_schools.py` → `uvicorn app.main:app --port 8501 --workers 4`
  - 데모 계정/도메인/코드 안내, 팀 정보 포함
  - _Requirements: 5.2_

- [ ] 23. DB 백업 스크립트
  - `backup_db.py` 작성 — 타임스탬프 파일명으로 `data/backups/`에 복사
  - cron으로 매일 실행, 7일 이상 된 백업 자동 삭제
  - _Requirements: Technical Constraints_

- [ ] 24. EC2 배포 스크립트
  - `deploy.sh` 작성 — PostgreSQL·Redis 기동 확인 → pip install → `init_db.py` → `seed_schools.py` → nohup uvicorn 실행
  - Instance Profile 인증이므로 AWS 자격증명 설정 단계 없음을 확인
  - 접속 주소와 로그 확인 명령 출력
  - _Requirements: 5.2_

- [ ] 25. Bedrock 사용량 모니터링
  - `refine_complaint()` 호출마다 호출 시각/모델 ID를 로그에 기록
  - `is_complete` 여부(되묻기 vs 확정)도 함께 기록해 대화 왕복 빈도 파악 가능하게 함
  - _Requirements: 5.1_

## Notes

- **P0 (필수)**: 태스크 1~20 (M0~M4)
- **P1 (중요)**: 태스크 21~22 (M5 — 문서화)
- **P2 (선택)**: 태스크 23~25 (M5 — 운영 편의)
- 완료 판정 기준: 학생 도메인 이메일 가입 → 대화형 작성(되묻기 최소 1회 포함) → 접수(미확인) → 관리자 코드로 가입 → 목록에서 클릭(자동 확인) → 수락(처리중) → 해결 완료 또는 보류(코멘트 필수) → 학생 게시판 반영 확인 → 철회 시연까지 전부 동작하고, 다른 학교 계정으로는 위 데이터가 전혀 보이지 않아야 한다.
- 스키마·API 계약·백엔드 모듈 구조는 각각 `requirements.md`(Data Model), `docs/api-contract.md`, `docs/backend-design.md`가 정본이다. 이 문서에서 중복 정의하지 않는다.

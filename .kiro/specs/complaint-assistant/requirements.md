# Requirements Document

## Introduction

**UniVoice — 학교별 익명 캠퍼스 민원 서비스.**

학생이 겪는 캠퍼스 시설 불편을 자연어로 제보하면 AI가 정중한 공문서로 다듬고 카테고리를 분류해, 학교별로 격리된 게시판에 올리고 관리자가 처리하는 서비스다.

학생은 구어체로 대충 써도 되고, AI(AWS Bedrock)가 행정 문서 규격(카테고리/위치/제목/본문)으로 변환한다. 학생은 변환 결과를 확인한 뒤에만 정식 접수하며, 접수된 민원은 같은 학교 학생 전체에게 익명으로 공개된다. 관리자는 자기 학교 민원만 보고 상태를 바꾼다.

### 핵심 설계 원칙

> **학교(School)가 데이터 격리의 경계다.**
> 모든 계정은 가입 시 학교에 소속되고, 민원·통계·목록은 항상 소속 학교로 필터링된다. 다른 학교 데이터는 보이지 않는다.

> **민원은 익명이다.**
> 게시판과 관리자 화면 어디에도 작성자 식별 정보가 노출되지 않는다. (내부적으로 어뷰징 방지를 위한 최소 추적은 별도 검토 — Out of Scope 참고)

### 대회 제약 사항

- **LLM**: AWS Bedrock (`global.anthropic.claude-sonnet-5`), 도구 호출로 민원 분류+변환
- **배포**: EC2 (팀 키 `hackathon-e1-t01-key.pem`), **8501 포트**

> **프론트엔드도 DB도 제약이 아니다.** 대회 가이드는 함께 받은 Streamlit 코드(`app.py` 등 5개)를
> "인프라와 Kiro 연동이 정상 동작하는지 확인하기 위한 **예시/테스트 코드**"라고 명시한다.
> 8501은 그 예시를 띄우라고 알려준 포트일 뿐, 거기 무엇이 뜨는지는 정해져 있지 않다.

### 기술 스택

**중앙 데이터스토어 + 여러 백엔드 워커**라는 흔한 웹 서버 구성으로 간다.

| 층 | 선택 | 왜 |
|---|---|---|
| 웹 서버 | FastAPI + uvicorn, **8501 포트** | 표준 HTTP. 프론트 정적 파일도 같은 서버가 서빙 |
| 영속 저장 | **PostgreSQL** | 여러 워커가 동시에 붙는다. 파일 락에 기대는 SQLite로는 안 된다 |
| 휘발 저장 | **Redis** | 로그인 세션·초안 상태. 워커 사이에 공유되어야 한다 |
| LLM | AWS Bedrock | 도구 호출 |

```
      브라우저
         │  :8501
    ┌────▼─────┐
    │  uvicorn │  워커 N개 (프로세스 여러 개)
    └────┬─────┘
         │
   ┌─────┴─────┐
   │           │
┌──▼───┐   ┌───▼───┐
│  PG  │   │ Redis │   ← 중앙. 모든 워커가 같은 것을 본다
└──────┘   └───────┘
```

**왜 워커를 여럿 두나**: LLM 호출이 수 초씩 걸린다. 워커가 하나면 한 사람이 민원을 정제하는
동안 다른 사람의 게시판 조회까지 막힌다. 워커를 늘리면 그 대기가 서로를 막지 않는다.

**그래서 상태를 프로세스 메모리에 둘 수 없다.** 다음 요청이 다른 워커로 갈 수 있어서,
로그인 세션이 메모리에 있으면 요청마다 로그인이 풀렸다 붙었다 한다.
**세션은 반드시 Redis에, 확정된 데이터는 반드시 PostgreSQL에** 둔다.

## Glossary

| 역할/용어 | 설명 |
|---|---|
| 학생 (student) | 민원 작성, 소속 학교 게시판 조회 |
| 관리자 (admin) | 소속 학교 민원 검토 및 상태 변경 |
| 학교 (school) | 계정과 민원의 격리 단위. 여러 개가 배포 전 시드로 미리 생성됨 |
| 세션 (chat session) | 학생 한 명의 대화 스레드 하나. "과거 대화" 목록의 한 줄. 로그인 세션과는 다른 개념 |
| 로그인 세션 (login session) | 인증 상태. HttpOnly 쿠키 + Redis |
| 초안 (draft) | 접수되기 전, 대화 세션에 쌓이는 임시 대화. 정식 접수해야 민원이 된다 |
| 확정안 (refined result) | AI가 `classify_and_refine_complaint` 도구로 낸 카테고리/위치/제목/본문 |
| 칩 (choices) | 되묻기 응답에 함께 오는 선택지 버튼들 |

## Requirements

### Requirement 1: 계정 & 학교 소속

**User Story:** 학생 또는 교직원으로서, 학교 이메일로 가입하고 로그인해서 내 학교 데이터에만 접근하고 싶다.

#### Acceptance Criteria

1. WHEN 사용자가 가입 화면을 열면 THEN 시스템 SHALL 학교를 검색·선택할 수 있는 드롭다운(줄임말 별칭 지원)을 표시한다.
2. WHEN 사용자가 드롭다운에서 학교를 선택하면 THEN 시스템 SHALL 해당 학교의 이메일 도메인을 표시에 고정하고 사용자는 아이디 부분만 입력하게 한다 (예: 조선대학교 선택 시 `@chosun.ac.kr`이 고정되고 `student1`만 입력).
3. WHEN 사용자가 가입 폼에 학교 코드를 비워두고 제출하면 THEN 시스템 SHALL 역할을 `student`로 지정해 계정을 생성한다.
4. WHEN 사용자가 가입 폼에 그 학교에 배정된 코드와 정확히 일치하는 값을 입력하면 THEN 시스템 SHALL 역할을 `admin`으로 지정해 계정을 생성한다.
5. WHEN 사용자가 학교 코드를 입력했으나 그 학교의 어떤 코드와도 일치하지 않으면 THEN 시스템 SHALL "유효하지 않은 코드"로 가입을 차단하고 학생으로 조용히 강등시키지 않는다.
6. WHEN 사용자가 드롭다운에 없는 학교의 이메일 도메인으로 가입을 시도하면 THEN 시스템 SHALL 서버 측에서 도메인을 재검증해 가입을 차단한다 (화면과 서버 양쪽에서 차단).
7. WHEN 사용자가 이미 등록된 이메일로 가입을 시도하면 THEN 시스템 SHALL 중복 경고를 표시하고 가입을 차단한다.
8. WHEN 사용자가 로그인에 성공하면 THEN 시스템 SHALL 세션에 `school_id`를 고정하고, 이후 모든 조회·변경을 그 학교로 필터링한다.
9. WHEN 로그인한 사용자가 자신의 비밀번호 변경을 요청하면 THEN 시스템 SHALL 현재 비밀번호 확인 후 변경을 허용한다.
10. WHEN 사용자가 계정 탈퇴를 요청하면 THEN 시스템 SHALL 경고+비밀번호 입력 → 최종 확인창 → 실행의 3단계를 거치게 하고, 완료되면 계정 관련 데이터를 삭제한다 (작성한 민원은 익명으로 남고 소유자 참조만 NULL로 지워진다).

> **판정 근거는 항상 도메인 하나다.** 프론트가 보낸 학교 이름을 서버가 신뢰하지 않고, 조립된 이메일의 `@` 뒤 도메인으로 다시 조회해 학교를 확정한다. 드롭다운은 입력 편의일 뿐이며, 서버 판정이 유일한 진실이다.
> **역할은 코드 하나로만 정해진다.** "교직원입니다" 같은 자기 선언형 필드는 받지 않는다 — 받으면 클라이언트가 스스로 관리자라고 주장할 수 있기 때문이다.

### Requirement 2: 민원 작성 (대화형 정제)

**User Story:** 학생으로서, 겪은 불편을 편한 말로 이야기하면 AI가 부족한 정보를 되물어 채운 뒤 행정 문서로 정리해주길 원하고, 확인 후에만 접수되길 원한다.

#### Acceptance Criteria

1. WHEN 학생이 자연어(구어체) 메시지를 입력하면 THEN 시스템 SHALL 해당 발화를 저장하고 AWS Bedrock에 도구 호출을 요청한다.
2. WHEN AI가 카테고리·위치·상황 중 하나라도 확정할 수 없다고 판단하면 THEN 시스템 SHALL 되묻는 질문과 선택지(칩)를 반환하고 대화를 계속한다.
3. WHEN 학생이 되묻는 질문에 답하면 THEN 시스템 SHALL 이전 답변을 포함한 전체 맥락으로 다시 AI를 호출한다.
4. WHEN AI가 카테고리·위치·상황을 모두 확정할 수 있다고 판단하면 THEN 시스템 SHALL 카테고리(고정 목록 중 하나)·위치·정제된 제목·행정 문서체 본문을 담은 확정안을 생성해 미리보기로 표시한다.
5. WHEN 학생이 확정안이 마음에 들지 않아 추가 메시지를 보내면 THEN 시스템 SHALL 같은 대화 경로로 처리해 새 확정안을 이전 것 위에 덮어쓴다 (수정 전용 API는 없다).
6. WHEN 학생이 "정식 접수" 버튼을 클릭하면 THEN 시스템 SHALL "이대로 접수하시겠습니까?" 확인창을 표시하고, 확인해야만 접수를 진행한다.
7. WHEN 학생이 접수 확인창에서 취소를 선택하면 THEN 시스템 SHALL 아무 것도 접수하지 않고 미리보기를 그대로 유지한다.
8. WHEN 학생이 접수 확인창에서 확인을 선택하면 THEN 시스템 SHALL `complaints` 테이블에 민원을 생성하고 상태를 `미확인`으로 설정한다.
9. IF 정식 접수가 완료되지 않았다면 THEN 시스템 SHALL 대화 내용을 `complaints` 테이블에 저장하지 않는다 (대화는 세션에만 존재).
10. WHEN 학생 또는 관리자가 접수된 민원의 "원문 보기"를 열면 THEN 시스템 SHALL 질문-답변 전체 왕복을 시간순으로 표시한다.
11. WHEN 학생이 자신이 접수한 민원의 철회를 시작하면 THEN 시스템 SHALL 다음 3단계를 순서대로 요구한다: ① 경고 문구와 비밀번호 입력 ② (비밀번호 일치 시) "정말 삭제하시겠습니까?" 최종 확인창 ③ 확인 시 삭제 실행 및 "삭제되었습니다" 알림.
12. IF 철회 1단계에서 비밀번호가 일치하지 않으면 THEN 시스템 SHALL 입력창을 유지한 채 오류를 표시하고 최종 확인창으로 진행하지 않는다.
13. WHEN 철회가 완료되면 THEN 시스템 SHALL 게시판과 관리자 목록 양쪽에서 즉시 해당 민원을 제외한다.
14. WHEN 사용자가 자신이 접수하지 않은 민원에 대해 철회를 시도하면 THEN 시스템 SHALL 요청을 거절한다 (버튼 자체가 보이지 않는 것과 별개로 서버가 소유권을 재검증한다).
15. WHEN 시스템이 "내 글" 여부를 화면에 표시해야 할 때 THEN 시스템 SHALL 작성자 식별자를 응답에 포함하지 않고 서버가 계산한 불린(`is_mine`) 값만 반환한다.

### Requirement 2.1: 대화 세션 관리

**User Story:** 학생으로서, 여러 개의 민원 작성 대화를 동시에 이어갈 수 있고, 새로고침해도 대화가 사라지지 않길 원한다.

#### Acceptance Criteria

1. WHEN 학생이 "새 대화"를 시작하면 THEN 시스템 SHALL 새 대화 세션을 생성하되, 메시지가 없는 빈 세션이 이미 있으면 그것을 재사용한다 (연타로 빈 세션이 쌓이는 것을 방지).
2. WHEN 학생이 사이드바에서 과거 대화 목록을 조회하면 THEN 시스템 SHALL 로그인한 사용자 소유의 세션 중 메시지가 하나 이상 있는 것만 최신순으로 반환한다.
3. WHEN 대화가 진행되어 확정안이 나오면 THEN 시스템 SHALL 세션 제목을 자동으로 갱신한다.
4. IF 사용자가 세션 제목을 직접 수정했다면 THEN 시스템 SHALL 그 이후 자동 갱신이 제목을 덮어쓰지 않는다.
5. WHEN 세션의 미압축 대화량이 임계치를 넘으면 THEN 시스템 SHALL 이전 세션주제와 밀려난 대화를 함께 압축해 새 세션주제를 생성하고, 이 작업은 응답을 마친 뒤 백그라운드에서 수행한다.
6. WHEN 압축이 실패하면 THEN 시스템 SHALL 기존 세션주제와 제목을 그대로 유지하고 다음 턴에 재시도한다 (턴 응답에는 영향 없음).
7. WHEN 사용자가 페이지를 새로고침하면 THEN 시스템 SHALL 대화 이력과 마지막으로 제시된 선택지(칩)를 서버에서 다시 불러와 복원한다.
8. WHEN 세션이 정식 접수되면 THEN 시스템 SHALL 해당 세션을 읽기 전용으로 전환한다.
9. IF 접수된 민원이 이후 철회되더라도 THEN 시스템 SHALL 해당 세션을 다시 쓰기 가능한 상태로 되돌리지 않는다 (이어 쓰려면 새 대화를 시작해야 한다).
10. WHEN 사용자가 자신이 소유하지 않은 세션 id로 접근하면 THEN 시스템 SHALL 404를 반환한다.

### Requirement 3: 학교별 전역 게시판

**User Story:** 학생으로서, 우리 학교에 접수된 모든 민원을 익명으로, 실시간에 가깝게 확인하고 싶다.

#### Acceptance Criteria

1. WHEN 학생이 게시판을 열면 THEN 시스템 SHALL 로그인한 사용자의 소속 학교에 접수된 민원만 표시한다 (다른 학교 민원은 조회 자체가 불가능).
2. WHEN 게시판이 민원을 렌더링하면 THEN 시스템 SHALL 카테고리, 위치, 제목, 본문, 접수 시각, 처리 상태를 표시한다.
3. WHEN 게시판이 민원을 렌더링하면 THEN 시스템 SHALL 작성자를 식별할 수 있는 정보를 노출하지 않는다 (단, 본인이 작성한 글에는 철회 버튼이 예외적으로 표시된다).
4. WHEN 학생이 "원문 보기" 토글을 열면 THEN 시스템 SHALL 학생-AI 대화 전체를 시간순으로 표시한다.
5. WHEN 민원의 상태가 미확인/확인/처리중/해결완료/보류/거절 중 하나이면 THEN 시스템 SHALL 상태별로 구분되는 배지를 표시한다.
6. IF 관리자가 해당 민원에 코멘트(특히 보류 사유)를 남겼다면 THEN 시스템 SHALL 게시판에서도 그 코멘트를 확인할 수 있게 한다.
7. WHEN 민원이 철회되면 THEN 시스템 SHALL 게시판 목록에서 해당 민원을 완전히 제외한다.

### Requirement 4: 관리자 대시보드

**User Story:** 관리자로서, 우리 학교에 접수된 민원을 확인하고, 정해진 절차에 따라 상태를 처리하고 싶다.

#### Acceptance Criteria

1. WHEN 관리자가 대시보드를 열면 THEN 시스템 SHALL 전체 건수와 상태별(미확인/확인/처리중/해결완료/보류/거절) 건수를 통계 카드로 표시한다.
2. WHEN 관리자가 상태별 필터 탭을 선택하면 THEN 시스템 SHALL 해당 상태의 민원만 목록에 표시한다.
3. WHEN 목록이 렌더링되면 THEN 시스템 SHALL 카테고리, 위치, 제목, 접수 시각, 상태를 표 형태로 표시한다.
4. WHEN 새 민원이 접수되면 THEN 시스템 SHALL 해당 민원을 `미확인` 상태로 목록에 표시하고, 이미 확인한 민원과 시각적으로 구분한다.
5. WHEN 관리자가 목록에서 `미확인` 상태의 민원을 클릭해 상세 화면을 열면 THEN 시스템 SHALL 그 즉시 상태를 `확인`으로 전환한다 (별도 확인 버튼 없이, 열람이라는 행위 자체가 전환을 유발한다).
6. IF 민원이 이미 `확인` 이후 상태라면 THEN 시스템 SHALL 상세 화면을 다시 열어도 상태를 변경하지 않는다 (멱등 동작).
7. WHEN 민원이 `확인` 상태일 때만 THEN 시스템 SHALL 수락/보류/거절 세 가지 결정 버튼을 표시한다 (`미확인` 상태에는 표시하지 않는다).
8. WHEN 관리자가 "수락" 버튼을 클릭하면 THEN 시스템 SHALL 상태를 `확인`에서 `처리중`으로 전환한다.
9. WHEN 민원이 `처리중` 상태이고 관리자가 "해결 완료" 버튼을 클릭하면 THEN 시스템 SHALL 상태를 `해결완료`로 전환한다.
10. IF 민원이 `처리중`을 거치지 않았다면 THEN 시스템 SHALL `해결완료`로의 직접 전환을 허용하지 않는다.
11. WHEN 관리자가 "보류" 버튼을 클릭하면 THEN 시스템 SHALL 코멘트 입력이 필수인 모달을 표시하고, 유효한 텍스트가 입력되어야만 상태를 `보류`로 전환하며 그 코멘트를 함께 저장한다.
12. WHEN 관리자가 "거절" 버튼을 클릭하면 THEN 시스템 SHALL 즉시 상태를 `거절`로 전환한다 (코멘트는 선택 사항).
13. WHEN 관리자가 민원 상태와 무관하게 코멘트를 추가하면 THEN 시스템 SHALL 해당 코멘트를 누적 기록으로 저장한다 (보류 전환 시에만 코멘트가 필수이며, 그 외에는 언제든 자유롭게 추가 가능).
14. WHEN 관리자가 상태를 변경하면 THEN 시스템 SHALL 학생 게시판에도 그 변경이 반영되도록 한다 (다음 조회 시점에 최신 상태가 보인다).
15. WHEN 민원이 철회되면 THEN 시스템 SHALL 관리자 목록에서도 해당 민원을 제외한다.
16. IF 관리자가 다른 학교에 속한 민원의 상태를 변경하려 시도하면 THEN 시스템 SHALL 이를 거절한다.

### Requirement 5: 대회 필수 기능

**User Story:** 심사위원으로서, Bedrock 활용도와 배포된 서비스를 직접 확인하고 싶다.

#### Acceptance Criteria

1. WHEN 심사위원이 Bedrock 호출 로그를 조회하면 THEN 시스템 SHALL 호출 시각, 모델 id, 도구 호출 성사 여부, 지연 시간, 토큰 수를 반환한다 (프롬프트·응답 본문은 저장하지 않는다).
2. WHEN 팀원이 EC2 공개 IP로 접속하면 THEN 시스템 SHALL 정상적으로 서비스에 접근 가능해야 한다.

## Category Taxonomy (고정 목록)

AI는 아래 목록 중 하나로만 분류한다 (자유 텍스트 카테고리 생성 금지 — Bedrock 도구 호출의 enum 제약으로 강제):

- 냉난방 / 공조
- 위생 / 배관
- 전기 / 설비
- 통신 / 인터넷
- 영상 / 기자재
- 공간 / 편의
- 안전 / 보안
- 기타

## Status Workflow

```
미확인 (unconfirmed, 기본값 — 학생이 정식 접수한 직후)
  │
  │  [관리자가 상세 화면을 열람 — 자동 전환, 버튼 없음]
  ▼
확인 (confirmed — 관리자가 열람함. 이 상태에서만 수락/보류/거절 버튼이 나타남)
  ├─→ [수락 버튼] → 처리중 (in_progress)
  │                    │
  │                    │  [해결 완료 버튼]
  │                    ▼
  │                 해결완료 (resolved) ── 최종 상태
  │
  ├─→ [보류 버튼 — 코멘트 필수] → 보류 (hold)
  │
  └─→ [거절 버튼] → 거절 (rejected) ── 최종 상태

(학생 전용, 위 상태와 독립적으로 언제든)
어떤 상태든 → 철회 (withdrawn)
```

- **초기 상태는 항상 `미확인`.** 접수 직후 관리자가 아무것도 하지 않은 상태.
- **`미확인 → 확인`은 버튼이 아니라 열람 행위로 자동 전환된다.** 관리자가 목록에서 해당 민원을 클릭해 상세 화면을 열면 그 즉시 DB에서 상태가 바뀐다. "확인 버튼"은 존재하지 않는다.
- **수락/보류/거절 버튼은 `확인` 상태에서만 노출된다.** `미확인` 상태의 민원에는 세 버튼이 보이지 않는다 (먼저 열람해서 확인 상태로 만들어야 결정 버튼이 나타남 — 관리자가 보지도 않고 처리 결정을 내리는 것을 막는 설계).
- **수락은 최종 상태가 아니라 처리 시작 신호다.** `확인 → 처리중`으로만 넘어가고, 실제로 조치가 끝나면 별도의 "해결 완료" 버튼으로 `처리중 → 해결완료`로 다시 전환해야 한다. 이 두 단계는 순서를 건너뛸 수 없다 (처리중을 거치지 않고 바로 해결완료로 갈 수 없음).
- **보류는 코멘트 입력이 필수다.** 보류 버튼을 누르면 코멘트 입력 모달이 뜨고, 텍스트를 채워야만 실제로 `보류` 상태로 바뀐다. 빈 코멘트로는 보류 처리가 완료되지 않는다.
- **코멘트는 상태와 무관하게 언제든 추가할 수 있다.** 보류로 전환하는 순간에만 코멘트가 필수이고, 그 외에는 관리자가 아무 때나 코멘트를 남길 수 있다 (진행 상황 공유, 추가 설명 등). 코멘트는 여러 개 누적 가능 — 단일 필드 덮어쓰기가 아니다.
- **거절은 최종 상태**이며 코멘트는 선택사항이다.
- **철회는 학생만 실행하는 별도 경로**이고 위 관리자 상태 전이와 독립적이다. 관리자가 이미 처리중/해결완료/거절 처리했더라도 학생은 철회할 수 있다 (1차 범위에서는 처리 완료 후 철회를 막지 않음 — 데모 단순성 우선, Out of Scope 참고).
- 철회된 민원은 학생 게시판과 관리자 목록 양쪽에서 즉시 사라진다 (하드 삭제가 아니라 상태 전환 — 레코드는 남지만 조회 쿼리에서 제외).
- 학생은 철회 외의 상태를 변경할 수 없다 (확인/수락/보류/거절/해결완료는 관리자 전용이며, 그중 확인은 관리자가 누르는 버튼조차 아니라 열람의 부작용이다).

## Data Model

### ER 관계도

```
schools (학교)
  │ 1
  │
  ├──< admin_codes (관리자 코드, N)         [school_id FK, ON DELETE CASCADE]
  │
  ├──< users (계정, N)                      [school_id FK, ON DELETE CASCADE]
  │      │ 1
  │      ├──< chat_sessions (대화 세션, N)   [user_id FK, ON DELETE CASCADE]
  │      │      (사이드바 "과거 대화" 한 줄. 접수되면 complaint_id로 민원과 연결)
  │      │
  │      └──< complaints (민원, N)          [submitted_by_user_id FK, ON DELETE SET NULL]
  │             (익명성 때문에 이 FK는 UI에 절대 노출되지 않음 — 철회 소유권 검증 전용)
  │
  └──< complaints (민원, N)                 [school_id FK, ON DELETE CASCADE]
         │ 1                                 (모든 조회는 이 school_id로 스코프)
         │
         ├──< complaint_conversations (학생-AI 대화, N)   [complaint_id FK, ON DELETE CASCADE]
         │      (접수 전에는 complaint_id가 NULL, chat_session_id로만 묶여 있음)
         │      [chat_session_id FK, ON DELETE **SET NULL** — 탈퇴로 세션이 사라져도
         │       접수된 민원의 근거 대화는 남아야 하므로]
         │
         └──< complaint_comments (관리자 코멘트, N)        [complaint_id FK, ON DELETE CASCADE]
                (author_user_id도 FK지만 익명 게시판 표시에는 "관리자"로만 뭉뚱그려짐)
```

**카디널리티 요약**:
| 관계 | 종류 | 삭제 전파 |
|---|---|---|
| school → users | 1:N | CASCADE (학교 삭제 시 계정도 삭제 — 실제로는 학교를 삭제하는 UI가 없어 시드 데이터 정리용) |
| school → admin_codes | 1:N | CASCADE |
| school → complaints | 1:N | CASCADE |
| user → complaints (submitted_by_user_id) | 1:N | **SET NULL** (계정 탈퇴해도 민원 레코드는 남기고 소유자만 지움 — 게시판은 이미 익명이라 표시에 영향 없음) |
| complaint → complaint_conversations | 1:N | CASCADE |
| complaint → complaint_comments | 1:N | CASCADE |

**왜 `submitted_by_user_id`만 SET NULL이고 나머지는 CASCADE인가**: 민원 자체(내용·상태·대화·코멘트)는 학교의 공공 기록이라 작성자가 탈퇴해도 보존해야 한다. 반면 학교나 민원이 삭제되면 그에 종속된 하위 데이터는 함께 사라지는 게 맞다 (고아 레코드 방지).

### PostgreSQL Schema
```sql
CREATE TABLE schools (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    aliases TEXT[],                    -- 검색용 줄임말. 예: ['조선대', '조대']
    email_domain VARCHAR(255) UNIQUE NOT NULL, -- 예: 'chosun.ac.kr' — 학교를 정하는 유일한 근거
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE admin_codes (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL,
    code VARCHAR(64) NOT NULL,                -- 데모용 임의 문자열, 학교당 여러 개 시드 가능
    is_used BOOLEAN NOT NULL DEFAULT FALSE, -- 1회성으로 쓸지는 시드 정책에 따름 (기본: 재사용 허용)
    FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
);

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(16) NOT NULL CHECK (role IN ('student','admin')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE
);

CREATE TABLE complaints (
    id SERIAL PRIMARY KEY,
    school_id INTEGER NOT NULL,
    submitted_by_user_id INTEGER,      -- 내부 추적용, UI에는 절대 노출 안 함
    category VARCHAR(32) NOT NULL,
    location VARCHAR(255) NOT NULL,
    refined_title VARCHAR(255) NOT NULL,
    refined_body TEXT NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT '미확인'
        CHECK (status IN ('미확인','확인','처리중','해결완료','보류','거절','철회')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    confirmed_at TIMESTAMPTZ,             -- 관리자가 처음 열람한 시각 (미확인→확인 자동전환 시점). NULL이면 아직 미확인
    FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
    FOREIGN KEY (submitted_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 대화 세션. "과거 대화" 목록의 한 줄이 이것이다.
CREATE TABLE chat_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    school_id INTEGER NOT NULL,        -- users에서 유도 가능하지만 접수 시 조인을 없애려 복제
    title VARCHAR(255),                -- 압축이 갱신한다. NULL이면 화면에 "새 대화"
    is_manual_title BOOLEAN NOT NULL DEFAULT FALSE,
    context TEXT,                      -- 세션 주제 (압축된 맥락)
    compacted_upto INTEGER,            -- 메시지 id. 이 id 이하는 context에 녹아 있다
    category VARCHAR(32),
    complaint_id INTEGER,              -- 접수되면 연결. 차는 순간 읽기 전용
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY (user_id)      REFERENCES users(id)      ON DELETE CASCADE,
    FOREIGN KEY (school_id)    REFERENCES schools(id)    ON DELETE CASCADE,
    FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE SET NULL
);
CREATE INDEX idx_sessions_user ON chat_sessions(user_id, updated_at DESC);

-- 학생-AI 대화 왕복 기록. 접수 전(정제 중)과 접수 후 모두 여기 남는다.
CREATE TABLE complaint_conversations (
    id SERIAL PRIMARY KEY,
    chat_session_id INTEGER,           -- 작성 중 조회는 이걸로
    complaint_id INTEGER,              -- 접수되면 채워진다. 게시판·관리자 조회는 이걸로
    role VARCHAR(16) NOT NULL CHECK (role IN ('student','assistant')),
    content TEXT NOT NULL,
    choices JSONB,                     -- 그 턴에 제시한 선택지(칩). 새로고침 복원용
    refined_json JSONB,                -- AI가 확정안을 낸 턴에만. 되묻는 턴은 NULL
    created_at TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY (chat_session_id) REFERENCES chat_sessions(id) ON DELETE SET NULL,
    FOREIGN KEY (complaint_id)    REFERENCES complaints(id)    ON DELETE CASCADE
);
CREATE INDEX idx_conv_session   ON complaint_conversations(chat_session_id, id);
CREATE INDEX idx_conv_complaint ON complaint_conversations(complaint_id, id);

-- 관리자 코멘트. 보류 전환 시 1건 필수 생성, 그 외에는 언제든 추가 가능한 누적 로그.
CREATE TABLE complaint_comments (
    id SERIAL PRIMARY KEY,
    complaint_id INTEGER NOT NULL,
    author_user_id INTEGER,            -- 작성한 관리자. 게시판 표시는 "관리자"로만 뭉뚱그림
    content TEXT NOT NULL,
    is_hold_reason BOOLEAN NOT NULL DEFAULT FALSE, -- 보류 전환 시 필수로 남긴 코멘트인지 표시
    created_at TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE,
    FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE SET NULL
);
```

```sql
-- Bedrock 호출 기록. 대회 심사(Requirement 5)용.
CREATE TABLE bedrock_logs (
    id SERIAL PRIMARY KEY,
    school_id INTEGER,
    called_at TIMESTAMPTZ DEFAULT NOW(),
    model_id VARCHAR(128) NOT NULL,
    is_complete BOOLEAN NOT NULL,        -- 도구 호출이 성사됐는지
    latency_ms INTEGER,
    input_tokens INTEGER,
    output_tokens INTEGER,
    error TEXT
);
CREATE INDEX idx_bedrock_called ON bedrock_logs(called_at DESC);
```

**`JSONB`를 쓰는 이유**: 접수 시점에 마지막 확정안을 꺼내는 것이 핵심 경로다.
`JSONB`는 이진 저장이라 파싱이 없고 `refined_json->>'category'`로 필드를 직접 읽을 수 있다.

**`refined_json` 설계 노트**: AI 발화는 `content`에 `"[정리 완료] {제목}"` 문자열로만 남아서
`category`·`location`·`refined_body`를 복원할 방법이 없다. 확정 턴에 JSON을 함께 저장해야
접수 시점에 서버가 꺼내 쓸 수 있다. **이 컬럼이 "확정됐는지" 표시도 겸한다** —
`refined_json IS NOT NULL`인 행이 없으면 아직 되묻는 중이다.

브라우저가 보낸 확정안을 그대로 저장하지 않는 이유는, 그러면 화면에서 값을 바꿔 보낼 수 있어
**AI가 확정한 것과 접수된 것이 달라지기 때문**이다.

**`bedrock_logs` 설계 노트**: 프롬프트와 응답 본문은 저장하지 않는다. 민원 내용이 로그에
중복 보관되면 익명성 관리 대상이 두 곳으로 늘어난다. 심사에 필요한 것은 "호출이 실제로
일어났다"는 사실과 지연·토큰이지 내용이 아니다.

**익명성 설계 노트**: `submitted_by_user_id`는 어뷰징 대응(동일 학생 반복 신고 등)을 위해 내부적으로만 보관하고, 학생 게시판·관리자 화면 어디에도 조회/표시하지 않는다. 완전 삭제를 원하면 아예 컬럼을 없애도 되지만, 계정 탈퇴 시 CASCADE 정리를 고려해 `ON DELETE SET NULL`로 둔다.

**`chat_session_id`가 `SET NULL`인 이유**: 탈퇴하면 `chat_sessions`가 CASCADE로 지워지는데,
`complaints`는 SET NULL이라 **민원은 남는다**(학교의 공공 기록이므로). 대화까지 세션을 따라
지워지면 **접수된 민원은 남는데 근거 대화가 사라져** 관리자 상세의 "학생 원문"이 빈다.
SET NULL이면 세션만 사라지고 대화는 `complaint_id`에 매달려 남는다.

접수되면 두 FK가 **모두** 채워져 어느 쪽으로 찾아도 같은 행이 나온다.
둘 다 NULL인 행(미접수인데 세션이 지워짐)은 정리 작업이 지운다.

**대화 이력 설계 노트**: `raw_text` 단일 컬럼 대신 `complaint_conversations`로 왕복 전체를 남긴다. 접수 전에는 `chat_session_id`로 묶이고, "정식 접수" 시점에 그 세션의 모든 행에 `complaint_id`를 채워 넣는다. 관리자 상세 화면과 학생 게시판의 "원문 보기"는 이 테이블을 시간순으로 렌더링한다.

**코멘트 설계 노트**: 단일 컬럼(예: `complaints.hold_reason`)이 아니라 별도 테이블로 분리한 이유는 Requirement 4의 "언제든 코멘트 추가 가능, 누적"을 만족하려면 1:N 구조가 필요하기 때문이다. `is_hold_reason`은 "보류로 전환하면서 필수로 남긴 코멘트"와 "그 이후 자유롭게 추가한 코멘트"를 구분해, UI에서 보류 사유를 강조 표시할 때 쓴다. `confirmed_at`은 `미확인 → 확인` 자동 전환이 정확히 언제 일어났는지 감사(audit) 목적으로 남긴다.

## State Storage (상태를 어디에 두나)

워커가 여럿이라 **프로세스 메모리는 상태를 둘 곳이 아니다.** 세 곳으로 나눈다.

### PostgreSQL — 확정된 것

| 무엇 | 왜 여기 |
|---|---|
| 계정·학교·관리자 코드 | 영속 |
| 접수된 민원, 상태, 코멘트 | 학교의 공공 기록 |
| 대화 이력 (`complaint_conversations`) | 접수 전 초안도 여기 남긴다 — 새로고침에 사라지면 안 된다 |

### Redis — 살아 있는 동안만

| 키 | 내용 | 사라지는 때 |
|---|---|---|
| `sess:{login_sid}` | 로그인 세션 — `user_id`·`school_id`·`role` | 로그아웃, TTL 만료 |
| `turn:{sid}:running` | 진행 중인 턴 표시 (`SET NX`) | 턴 종료 (실패해도) |
| `compact:{sid}` | 압축 진행 표시 (`SET NX`) | 압축 종료 (실패해도) |
| `sess_state:{sid}` | 현재 단계·반복 횟수 (칩 캐시) | TTL |

**로그인 세션이 Redis에 있어서 새로고침해도 로그인이 유지된다.** 브라우저에는 HttpOnly
쿠키로 세션 id만 있고, 어느 워커가 받든 같은 Redis를 보므로 결과가 같다.

**소유권은 Redis가 아니라 `chat_sessions.user_id`가 쥔다.** 세션이 "과거 대화" 목록에
남아야 하므로 어차피 영속 행이고, 행이 있으면 소유자도 거기 있는 게 맞다.

**`turn:{sid}:running`은 턴 중복을 막는다.** 응답이 오기 전에 또 보내면 Bedrock 호출이 둘 다
돌고 대화 순서가 꼬인다. `SET NX`로 세워야 한다 — 워커가 여럿이라 "있는지 보고 세우기"로 하면
두 워커가 동시에 통과한다.

**로그인 세션 TTL은 요청마다 연장한다(sliding).** 고정 만료면 민원을 길게 쓰는 도중 로그아웃된다.
나머지 키는 짧은 고정 TTL이고, 잃어도 DB에서 복원되므로 연장하지 않는다.

### 브라우저 — 화면에만 관련된 것

입력 중인 텍스트, 열어둔 모달, 펼친 토글, 선택한 필터 탭.
**새로고침에 사라져도 되는 것만** 여기 둔다.

### 어디에도 캐시하지 않는 것

**민원 목록·통계·코멘트는 매번 다시 읽는다.** 워커가 여럿이고 다른 사용자가 계속 바꾸므로,
어디든 캐시하면 누군가는 낡은 것을 본다.

## Technical Constraints

### 필수 제약
- **LLM**: AWS Bedrock, `global.anthropic.claude-sonnet-5` (리전 자동 감지, Instance Profile 인증)
- **배포**: EC2
- **DB**: PostgreSQL + Redis
- **비밀번호**: bcrypt 해싱

### 권장 사항
- Bedrock 도구 호출(tool use)로 카테고리를 enum으로 강제 — 자유 텍스트 분류 시 오분류/오타 위험
- CloudWatch Logs로 Bedrock 호출 모니터링
- DB 백업 스크립트 (cron)

## Out of Scope (1차)

- 이메일 인증, OAuth 로그인
- 완전 무기명(내부 추적조차 없는 익명) — 어뷰징 대응 및 철회 기능을 위해 최소 추적(`submitted_by_user_id`)은 유지
- 다국어 지원
- 이미지 첨부
- 학교 간 데이터 공유/통합 통계
- 민원 상태 변경 알림(이메일/푸시)
- 관리자 다수 권한 등급 (관리자는 전부 동일 권한)
- 실시간 웹소켓 갱신 (새로고침 기반으로 충분)
- 관리자가 이미 처리(처리중/해결완료/거절)한 민원의 철회를 막는 정책 (1차는 항상 철회 허용)
- "철회됨" 상태의 별도 조회/복구 UI (철회 시 조회 대상에서 제외될 뿐 데이터는 보존 — 필요하면 DB 직접 조회로 확인)
- 철회 사유 입력 (버튼 한 번 + 비밀번호 확인이면 충분)
- 미접수 대화(draft)의 임시저장/복구 (탭 닫으면 유실 허용)
- 코멘트 수정/삭제 (누적 로그이므로 추가만 가능, 정정하려면 새 코멘트를 덧붙임)
- `처리중`에서 `보류`나 `거절`로의 역방향 전환 (1차는 `확인` 상태에서만 세 버튼이 나타나고, `처리중` 진입 후에는 "해결 완료"만 존재 — 처리 도중 재검토가 필요하면 코멘트로 남기는 정도로 충분하다고 판단)

## Success Metrics

### 대회 심사 기준
- Bedrock 활용도 (분류 + 변환에 도구 호출 사용)
- 데모 완성도 (학생 접수 → 관리자 처리 → 게시판 반영 흐름)
- 아이디어 독창성 (학교별 격리 + 익명 게시판 + AI 행정 문서 변환)

### 기술 지표
- Bedrock 응답 시간 < 3초
- 카테고리 분류 정확도 (고정 목록 준수율) 100% (enum 강제이므로 오분류 자체가 불가능해야 함)

## References

- [AWS Bedrock 문서](https://docs.aws.amazon.com/bedrock/)
- [Claude 도구 호출](https://docs.anthropic.com/claude/docs/tool-use)
- 목업: `docs/anonymous_complain_assistant*.html` (UniVoice UI 참조, 정본보다 앞선 버전이므로 상태값 차이 있음 — `docs/api-contract.md` 8장 참조)
- 구현 규약: `docs/api-contract.md` (프론트-백엔드 경계), `docs/backend-design.md` (백엔드 내부 구조)

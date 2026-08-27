# 문서 구조 안내

## 어디를 보나

```
.kiro/specs/complaint-assistant/   ★ 정본 — 어긋나면 이쪽이 이긴다
├─ requirements.md                 User Story · 데이터 모델 · 수용 기준
├─ design.md                       컴포넌트 설계 · 상태 전이 · 테스트 전략
└─ tasks.md                        태스크 분해

docs/
├─ api-contract.md                 ★ 프론트·백 연결 규약 (구현 시작점)
├─ dev-log.md                      결정의 배경과 과정 (append-only)
├─ requirements_v1.md              v1 설계 — 동결, 원칙 참조용
└─ proposal_v1.md                  v1 제안서 — 동결
```

**구현을 시작한다면** `docs/api-contract.md`부터 본다. 함수 23개가 프론트·백 양쪽 시그니처와
건드리는 테이블까지 적혀 있어서, 두 쪽이 서로를 기다리지 않고 각자 만들 수 있다.

**기능이 왜 그런지 궁금하면** `.kiro/specs/complaint-assistant/requirements.md`.

## 무엇을 만드나

**UniVoice — 학교별 익명 캠퍼스 민원 서비스.**

학생이 겪은 시설 불편을 구어체로 말하면 AI(Bedrock)가 카테고리·위치·제목·본문을 갖춘
행정 문서로 다듬는다. 정보가 부족하면 **채팅으로 되묻는다.** 학생이 최종안을 확인하고
"정식 접수"를 눌러야 게시판에 올라가고, 같은 학교 학생 전체에게 익명으로 공개된다.
관리자는 자기 학교 민원만 보고 상태를 바꾼다.

## 기술 스택

| 층 | 선택 |
|---|---|
| 서버 | FastAPI + uvicorn, **8501 포트** |
| 프론트 | 정적 파일(JS)을 같은 서버가 서빙 |
| LLM | AWS Bedrock `global.anthropic.claude-sonnet-5`, 도구 호출 |
| DB | SQLite |
| 배포 | EC2 (팀 키 `hackathon-e1-t01-key.pem`) |

**8501에 일반 웹서버를 올린다.** 대회 가이드가 함께 준 Streamlit 코드를
"인프라와 Kiro 연동 확인용 예시/테스트 코드"라고 명시하므로 프론트엔드는 제약이 아니다.
8501은 보안그룹에서 열어준 포트일 뿐이다.

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8501
```

## 핵심 설계 원칙

1. **학교가 데이터 격리의 경계다.** 모든 조회·변경은 세션의 `school_id`로 필터링된다.
   프론트는 학교를 신경 쓰지 않는다 — 보내지도 않고 보내도 무시된다.
2. **민원은 익명이다.** 작성자 id는 응답에 실리지 않는다. "내 글" 여부만 서버가
   불린 하나로 계산해 내려준다(철회 버튼 노출용).
3. **AI는 되묻는다.** 정보가 부족하면 확정하지 않고 질문한다. 확정안이 나와도
   **사용자가 접수를 눌러야** 게시판에 올라간다.
4. **상태 전이는 서버가 판정한다.** 프론트가 버튼을 감추는 것은 편의이고,
   막는 것은 서버다. 전이 검증은 `UPDATE ... WHERE status=<전제>`로 한다.

## 시작하기

```bash
# 1. Bedrock 연결 실측 — 첫 태스크
python connectionTest/bedrock_simple_test.py

# 2. DB 준비
python init_db.py && python seed_schools.py

# 3. 서버
uvicorn app.main:app --host 0.0.0.0 --port 8501
```

**M0의 첫 태스크는 Bedrock 도구 호출 실측이다.** 민원 분류·정제 전체가 그 위에 서 있어서,
안 되면 구조화 출력 파싱으로 방향을 틀어야 한다. 그 전에는 뒤 작업을 시작하지 않는다.

## 참고

- `connectionTest/` — 대회에서 받은 예시 코드(Bedrock·RAG·EC2 확인용). 제품 코드가 아니다
- `connectionTest/TEAM_GUIDE.html` — 대회 가이드
- `docs/anonymous_complain_assistant.html` — UI 시안. **정본보다 앞선 버전이라 상태값이 다르다.**
  차이는 `api-contract.md` 8장 참조

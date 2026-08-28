# 엔드투엔드 실행 기록 — 학생 민원 접수 → 관리자 처리

_2026-08-28 · 실서버(EC2 3.38.151.165:8501)에서 실제 요청/응답을 캡처한 기록 · 버그 수정 후 재검증판_

이 문서는 **가설이나 설계가 아니라, 배포된 백엔드에 실제로 HTTP 요청을 쏴서 받은 응답**을 그대로 정리한 것이다. 학생과 관리자가 보는 것이 어떻게 다른지, 요구사항 로직이 실제로 도는지를 요청 단위로 보여준다.

> **재검증 결과: 자동 검사 16/16 PASS.** 계약 정합 수정(`signup` 응답에 `role` 포함, `sendMessage`
> 응답 필드명 `question`/`step`/`preview`)이 반영된 최신 백엔드로 다시 돌린 기록이다.

- 서버: `http://3.38.151.165:8501/api` (FastAPI + PostgreSQL + Redis + AWS Bedrock)
- 등장 계정: **학생**(조선대, 코드 없이 가입), **관리자**(조선대, 관리자 코드로 가입), **타학교 학생**(전북대)
- LLM: `global.anthropic.claude-sonnet-5` 실호출

> 응답 JSON은 지면상 핵심 필드만 발췌했다. 전체 원문은 실행 로그에 있다.

---

## 막 1. 계정 — 학교 코드가 역할을 가른다

| STEP | 주체 | 요청 | 결과 |
|---|---|---|---|
| 1 | 학생 | `POST /auth/signup` (코드 없음) | 201, `{user_id, role:"student"}` |
| 2 | 관리자 | `POST /auth/signup` (`admin_code: CHOSUN-ADMIN-2026`) | 201, `{user_id, role:"admin"}` |
| 3 | 학생 | `GET /auth/me` | `role: "student"`, `school_name: "조선대학교"` |
| 4 | 타학교학생 | `POST /auth/signup` (`@jbnu.ac.kr`) | 201 → 전북대 소속 |

**같은 가입 API인데 학교 코드 유무로 role이 갈린다.** 코드는 서버만 아는 값(`admin_codes` 시드)이라 클라이언트가 스스로 관리자라고 주장할 수 없다. **응답 body에 `role`이 함께 온다**(api-contract #2 준수 — 가입 직후 화면 분기용).

---

## 막 2. 학생이 대화로 민원 작성 (AI가 되묻고 정제)

`POST /chat-sessions` → `session_id:7` 발급.

**STEP 6 — 학생: "화장실에 문제가 있어요"**
```jsonc
{ "is_complete": false, "step": "location",
  "question": "화장실이 어느 건물, 몇 층에 있는지 알려주실 수 있을까요?",
  "choices": ["공학관 3층","본관 1층","학생회관 2층","서관 지하 1층","정확한 위치를 잘 모르겠어요","직접 입력"] }
```
→ Bedrock이 **위치가 부족**하다고 판단(`ask_followup`), 되묻기 + 선택지 생성.
**응답 필드명은 계약대로 `question`/`step`**(구버전 `follow_up_question`/`missing` 아님).

**STEP 7 — 학생: "본관 3층 남자화장실 세면대 누수"**
```jsonc
{ "is_complete": false, "step": "detail",
  "question": "세면대에서 구체적으로 어떤 상태인가요?",
  "choices": ["세면대 아래 배관에서 물이 계속 흘러나옴","물을 틀면 연결 부위에서 물이 샘", ...] }
```
→ 위치 확보, 이번엔 **상황(detail)** 을 되묻는다.

**STEP 8 — 학생: (상황 구체화)**
```jsonc
{ "is_complete": true,
  "preview": {
    "category": "위생 / 배관",
    "location": "본관 3층 남자화장실",
    "refined_title": "본관 3층 남자화장실 세면대 배수구 누수로 인한 바닥 미끄럼 위험",
    "refined_body": "[현상] ... [영향] ... [요청] ..." },
  "title": "...", "category": "위생 / 배관" }
```
→ 세 요소가 다 확정되니 `classify_and_refine` 도구로 **행정 문서체 확정안** 생성.
**확정 응답에 `preview`(category/location/refined_title/refined_body 4필드)가 계약대로 실린다.**
카테고리는 고정 목록 중 `위생 / 배관`으로 분류.

**STEP 10 — `GET .../conversation`**: 위 왕복 전체(학생 3발화 + assistant 3발화 + choices)가 DB에서 그대로 복원됨 → **새로고침해도 대화가 살아있다.**

> **단계를 서버가 강제하지 않는다.** 몇 번 되묻을지는 모델이 정한다. 학생이 첫 문장에 위치·상황을 다 쓰면 되묻기 없이 바로 확정된다.

---

## 막 3. 정식 접수

**STEP 11 — 학생: `POST /chat-sessions/7/submit`**
```json
{ "complaint_id": 5, "next_session_id": 8 }
```
→ 확정안(`refined_json`)으로 민원 생성(상태 **미확인**), 다음 세션 자동 발급. 본문에 값을 실어 보내지 않는다 — 서버가 저장된 확정안을 쓴다(위조 방지).

---

## 막 4. 학생 게시판 — 익명 · 우리 학교만

**STEP 12 — 학생: `GET /complaints`** → 조선대 민원 목록. 방금 접수한 `id:5`가 맨 위.
```jsonc
{ "id": 5, "category": "위생 / 배관", "location": "본관 3층 남자화장실",
  "title": "...", "status": "미확인", "confirmed_at": null,
  "is_mine": true, "comments": [] }
```
- **`is_mine: true`** — 서버가 세션과 대조해 계산한 불린. 작성자 원본 id(`submitted_by_user_id`)는 **응답에 없음**(익명성).
- 목록의 다른 민원들은 `is_mine: false`. 보류된 건에는 보류 사유 코멘트만 실려 있음.

**STEP 13 — 타학교학생: `GET /complaints`** → `[]` (전북대 학생에겐 조선대 민원이 **하나도 안 보임**)

**STEP 14 — 타학교학생: `GET /complaints/5`** → **404** `NOT_FOUND` (id를 알아도 다른 학교 것은 존재 자체를 숨김)

---

## 막 5. 학생이 관리자 기능 시도 → 차단

**STEP 15 — 학생: `GET /admin/stats`** → **403** `FORBIDDEN_ROLE` ("관리자 전용 기능입니다.")

→ 학생과 관리자가 보는 것이 **서버에서 실제로 갈린다.** 프론트가 버튼을 감추는 것과 무관하게 서버가 role로 막는다.

---

## 막 6. 관리자 대시보드

**STEP 16 — 관리자: `GET /admin/stats`**
```json
{ "total": 4, "by_status": { "미확인": 2, "확인": 0, "처리중": 0, "해결완료": 1, "보류": 1, "거절": 0 } }
```
→ 상태별 통계 카드. 학생은 이걸 못 본다(막 5).

**STEP 17 — 관리자: `POST /admin/complaints/5/open`**
```jsonc
{ "id": 5, "status": "확인", "confirmed_at": "2026-08-28T05:31:34...", ... }
```
→ **목록을 여는 행위 자체가 `미확인 → 확인` 자동 전환.** "확인 버튼"은 없다. `confirmed_at`이 이때 처음 기록됨.

**STEP 18 — 관리자: `GET /complaints/5/conversation`** → 학생-AI 대화 원문 전체 열람.

---

## 막 7. 관리자 상태 처리 + 코멘트

**STEP 19 — 코멘트 추가: `POST /admin/complaints/5/comments`**
`{"content": "현장 확인하겠습니다. 배관팀에 접수했습니다."}` → `comments`에 `is_hold_reason:false`로 누적.

**STEP 20 — 수락: `POST /admin/complaints/5/accept`** → 상태 **확인 → 처리중**

**STEP 21 — 해결: `POST /admin/complaints/5/resolve`** → 상태 **처리중 → 해결완료**

> 전이는 `UPDATE ... WHERE status=<선행상태>` 한 문장이라, 순서를 건너뛰면(미확인에서 바로 수락, 확인에서 바로 해결) DB가 거부하고 409가 난다. (별도 검증에서 확인함)

---

## 막 8. 처리 결과가 학생 게시판에 반영

**STEP 22 — 학생: `GET /complaints/5`**
```jsonc
{ "id": 5, "status": "해결완료", "is_mine": true,
  "comments": [ { "content": "현장 확인하겠습니다. 배관팀에 접수했습니다.", "is_hold_reason": false } ] }
```
→ 학생이 다시 조회하면 **관리자가 바꾼 상태(해결완료)와 코멘트가 그대로 보인다.** 관리자와 학생이 같은 민원을 각자의 권한으로 본다.

---

## 막 9. Bedrock 호출 로그 (대회 심사용)

**STEP 23 — 관리자: `GET /admin/bedrock-logs?limit=5`**
```jsonc
[ { "model_id": "global.anthropic.claude-sonnet-5", "is_complete": true,
    "latency_ms": 4547, "input_tokens": 1897, "output_tokens": 336, "error": null }, ... ]
```
→ AI 호출마다 시각·모델·도구성사 여부·지연·토큰이 기록됨. **되묻기 호출은 `is_complete:false`, 확정 호출은 `true`.** 프롬프트·응답 본문은 저장하지 않음(익명성).

---

## 정리 — 이 시나리오가 증명하는 것

| 요구사항 | 이 로그에서의 근거 |
|---|---|
| 학교 코드로 학생/관리자 구분 | 막 1 (코드 유무 → role) |
| AI 대화형 정제(되묻기→확정) | 막 2 (STEP 7~9, Bedrock 실호출) |
| 새로고침 대화 복원 | 막 2 (STEP 10) |
| 정식 접수 → 미확인 | 막 3 |
| 익명 게시판, 학교 격리 | 막 4 (is_mine, 타학교 404) |
| 역할 경계(학생≠관리자) | 막 5 (403) vs 막 6 (200) |
| 열람 = 확인 자동전환 | 막 6 (STEP 17) |
| 상태 전이(수락→해결) + 코멘트 | 막 7 |
| 처리 결과가 학생에게 반영 | 막 8 |
| Bedrock 로그 | 막 9 |

**결론**: "학생이 민원 넣으면 시설 관리자가 보고 처리한다 / 코멘트 / 민원 목록 / 상태" — 이 전 과정이 실제 서버에서 요청-응답으로 동작함을 확인했다. UI(화면)만 아직 없고, 백엔드 로직은 정본 요구사항대로 전부 구현되어 돈다.

---

## 재검증 요약 (버그 수정 후)

자동 검사 **16/16 PASS**. 계약 정합 수정이 반영됨을 확인:

| 이전 상태 | 수정 후 (이번 검증) |
|---|---|
| `signup` 응답에 `role` 없음 | ✅ `{user_id, role}` 반환 |
| `sendMessage` 필드명 `follow_up_question`/`missing` | ✅ 계약대로 `question`/`step` |
| 확정 응답 `preview` 구조 | ✅ `preview{category,location,refined_title,refined_body}` |

나머지(학교 격리·익명·역할 403·상태전이 open→accept→resolve·코멘트·Bedrock 로그)도 전부 PASS.
`/health`도 계층별(db/redis/bedrock) 상태를 반환하며 한 계층이 죽어도 200으로 뜬다(별도 검증).

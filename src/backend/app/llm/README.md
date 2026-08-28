# llm/ — Bedrock이 사는 곳

**Bedrock 호출은 이 폴더 밖에 없다.** 모델 교체가 여기서 끝나야 한다.

**`repo`를 절대 호출하지 않는다.** `llm`은 `school_id`를 모른다 — 그건 요청 맥락의 값이다. 호출 결과(지연·토큰·성공 여부)를 `Usage`에 담아 반환하고, `bedrock_logs` 적재는 이를 부르는 `session_service`가 한다.

정본: `docs/backend-design.md` §8 (Bedrock 호출 규격), §7-1 (도구 둘 구조).

## 파일

| 파일 | 내용 |
|---|---|
| `types.py` | `RefineResult`, `CompactResult`, `Usage` dataclass — 이게 `session_service`와의 계약 타입 |
| `choices.py` | `CATEGORIES`(7종), `DETAIL_CHIPS`, `merge_choices()` |
| `tools.py` | `ASK_FOLLOWUP`, `CLASSIFY_AND_REFINE` 도구 스키마 (client 내부에서만 씀) |
| `client.py` | `refine(context, buffer)`, `compact(prev_context, messages)` |
| `prompts.py` | 시스템 프롬프트, 압축 프롬프트 문자열 |

## 환경이 강제하는 것 (어기면 무조건 AccessDenied)

`connectionTest/bedrock_simple_test.py`가 실측으로 확인한 제약:

1. **리전을 명시하지 않는다.** `boto3.client('bedrock-runtime')` — region_name 인자 없이. EC2 Instance Profile이 리전을 자동으로 준다. 하드코딩하면 배정 리전 외라서 차단된다.
2. **`global.` 추론 프로필을 쓴다.** `global.anthropic.claude-sonnet-5`. raw 모델 id는 "on-demand throughput isn't supported" 에러.
3. **자격증명을 코드에 넣지 않는다.** Instance Profile이 자동으로 잡는다.

모델 id는 `core/config.py`의 `settings.llm_model_id`에서 읽는다 (하드코딩 금지).

## 도구 둘 구조가 핵심

`tool_choice: {"type": "any"}`로 매 턴 **반드시 하나**를 부르게 강제한다.

- `ask_followup` → 정보 부족. `session_service`가 질문+칩을 학생에게 내려보낸다.
- `classify_and_refine_complaint` → 확정 가능. `refined_json`으로 저장된다.

"부족한가"를 도구의 부재로 읽지 않는다 — 부재로 읽으면 되묻는 문장만 얻고 칩을 만들 근거가 없다. `category`는 `enum`으로 7종 고정 (자유 문자열이면 매칭이 깨진다).

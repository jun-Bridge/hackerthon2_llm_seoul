# `app/llm` — Bedrock LLM 경계

Bedrock 요청 조립, 호출, 응답 파싱과 LLM 입출력 검증은 이 디렉터리 안에서 끝난다. 모델이나 응답 형식이 바뀌어도 서비스·repo 계층에 Bedrock 세부 구현이 새지 않아야 한다.

- `repo`, DB, Redis를 직접 호출하지 않는다.
- `school_id`를 알지 못하며 `bedrock_logs` 저장은 호출한 서비스가 담당한다.
- 사용자 대화와 전체 요청·응답 본문을 로그나 오류 메시지에 넣지 않는다.
- 외부 LLM 출력은 항상 신뢰하지 않고 런타임 계약 검증 후 반환한다.

정본은 `docs/backend-design.md` §7-1, §7.4, §8이다.

## 파일

| 파일 | 역할 |
|---|---|
| `client.py` | `refine()`, `compact()`, Anthropic 요청 조립, Bedrock 호출·재시도, 응답 파싱 |
| `types.py` | 서비스 경계 타입 `Usage`, `RefineResult`, `CompactResult`와 생성 후 불변성 |
| `validation.py` | 신뢰할 수 없는 입력·도구 payload·compact 결과의 런타임 검증 |
| `choices.py` | 고정 카테고리 7종, 카테고리별 칩, 결정론적 `merge_choices()` |
| `tools.py` | `ask_followup`, `classify_and_refine_complaint` JSON Schema |
| `prompts.py` | 정제·누적 압축 시스템 프롬프트와 인젝션 방어 지시 |
| `adversarial_checks.py` | 외부 서비스 없이 실행하는 계약·공격·통합 회귀 검사 |

## 공개 계약

```python
from app.llm.client import compact, refine

result = refine(context: str | None, buffer: list[dict])
summary = compact(prev_context: str | None, messages: list[dict])
```

입력 메시지는 다음 두 필드만 허용한다.

```python
{"role": "student" | "assistant", "content": "비어 있지 않은 문자열"}
```

추가 필드, 알 수 없는 role, 빈 content와 비문자열은 `ContractViolation`으로 거부한다. 입력 목록과 원소는 직접 수정하지 않고 정규화한 새 목록을 사용한다.

### `refine()`

- `student`를 Anthropic `user`로 변환한다.
- 연속된 동일 role은 `\n\n`으로 병합하고 첫 메시지가 `user`인지 검사한다.
- 압축된 `context`는 사용자 메시지가 아니라 최상위 `system` 필드에 넣는다.
- 두 도구와 `tool_choice: {"type": "any"}`를 항상 포함한다.
- 응답 `content`에서 첫 번째 `tool_use`만 채택한다.
- 첫 도구가 잘못됐으면 뒤의 정상 도구로 fallback하지 않는다.

반환값은 다음 두 분기 중 정확히 하나다.

- `is_complete=False`: `missing`, `question`, `choices`
- `is_complete=True`: `category`, `location`, `refined_title`, `refined_body`, `session_title`

분기 필드 혼합과 필수 필드 누락은 거부한다. follow-up 선택지는 tuple 기반 불변 Sequence로 보관하여 일반 메서드뿐 아니라 `list.append()` 기본 메서드를 이용한 우회 변이도 차단한다.

### `compact()`

이전 context와 서비스가 고정한 메시지 구간을 한 개의 사용자 데이터 JSON으로 전달한다. compact 요청에는 도구와 `tool_choice`를 넣지 않는다.

응답은 설명문이나 Markdown fence가 없는 다음 JSON 객체 하나여야 한다.

```json
{
  "context": "누적 맥락",
  "title": "짧은 세션 제목"
}
```

확정 사실은 context 안에서 다음 표기를 사용한다.

```text
확정 카테고리: 냉난방 / 공조
확정 위치: 공학관 3층 301호
민원 제목: 강의실 냉방 설비 점검 요청
```

이전 확정 사실의 누락과 입력에 없는 category·표기 값을 거부한다. 최근 메시지에 같은 표기의 새 값이 있으면 명시적인 정정으로 처리한다.

현재 길이 제한은 다음과 같다.

- context: 8,000자
- title: 100자
- 모델의 compact 원시 text 응답: 12,000자

## 선택지 계층

고정 taxonomy는 다음 7종이며 도구 enum과 런타임 validator가 같은 목록을 사용한다.

```text
냉난방 / 공조
위생 / 배관
전기 / 설비
영상 / 기자재
공간 / 편의
안전 / 보안
기타
```

`merge_choices()` 규칙:

- `missing == "category"`: 모델 선택지를 무시하고 고정 7종의 새 목록만 반환한다.
- 그 외: 알려진 category의 고정 칩 → 모델 선택지 → `직접 입력` 순서다.
- 공백·빈 값과 중복을 제거하고 최초 등장 순서를 유지한다.
- `직접 입력`은 마지막에 정확히 한 번만 둔다.
- 원본 Sequence와 고정 목록은 변경하지 않는다.

## Bedrock 호출 규칙

```python
boto3.client("bedrock-runtime")
```

1. `region_name`을 전달하지 않는다. EC2 Instance Profile이 할당 리전을 제공한다.
2. API 키를 사용하지 않는다. AWS 표준 자격증명 체인과 IAM Role을 사용한다.
3. access key·secret key를 코드나 요청에 넣지 않는다.
4. 모델 ID는 `get_settings().llm_model_id`에서 읽는다. 기본값은 `global.anthropic.claude-sonnet-5`다.
5. Anthropic 버전은 `bedrock-2023-05-31`, 최대 출력 토큰은 정제·압축 모두 1,024다.

실행 환경에는 `boto3`와 `pydantic-settings`가 설치되어 있어야 한다. 저장소의 `connectionTest/bedrock_simple_test.py`는 리전 미지정·global 추론 프로필 제약을 실제 환경에서 확인한 참고 코드다.

## 오류와 재시도

`client.BedrockError`는 core의 502 `BedrockError`를 상속하며 실패 `Usage`와 안전한 AWS 오류 코드만 보존한다.

| 결과 | 호출 정책 |
|---|---|
| 성공 | 1회 호출 |
| `AccessDeniedException` | 재시도 없음 |
| `ValidationException` | 재시도 없음 |
| 일반 네트워크 오류 | 재시도 없음 |
| `ThrottlingException` | 0.25초 후 정확히 1회 재시도 |
| Throttling 연속 발생 | 최대 2회 호출 후 실패 |
| 응답 계약·파싱 실패 | 재시도 없이 안전한 `BedrockError` |

latency는 `time.monotonic()`으로 측정한다. 성공 시 input/output token을 `Usage`에 담고, 실패 시 model ID·latency·안전한 error를 보존한다. 원본 예외 메시지, 사용자 민원과 request body는 외부 오류 메시지에 포함하지 않는다.

## 검증

실제 Bedrock을 호출하지 않고 mock client로 정상·공격·재시도·공개 함수 통합 경로를 검사한다.

PowerShell에서:

```powershell
Set-Location src/backend
$env:PYTHONPATH = "."
python -B -m app.llm.adversarial_checks
python -m compileall -q app/llm
```

현재 기대 출력:

```text
Phase 0~6 adversarial checks passed: 352
```

검사 범위에는 schema/taxonomy 우회, 손상 JSON, 첫 tool 선택, 결과·입력 불변성, AccessDenied 무재시도, Throttling 호출 상한, compact 사실 누락·환각, API key·credential·region 하드코딩 금지가 포함된다.

실제 AWS 연결 검사는 이 영구 회귀 검사에 포함하지 않는다. 서비스 통합 시 `session_service`는 성공과 실패의 `Usage`를 `bedrock_log_repo`에 저장하고, compact 실패 시 기존 context·title·`compacted_upto`를 유지해야 한다.

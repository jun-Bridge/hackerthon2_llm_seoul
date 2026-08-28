# 프론트 작업 지시 — 채팅 이미지 첨부 (+버튼)

_2026-08-28 · 대상: 프론트 담당 · 백엔드는 배포 완료(EC2 8501)_

## 무엇을 원하나

채팅 입력창에 **+버튼**을 달아 사진 한 장을 첨부할 수 있게 한다. 학생이 사진을 붙이면
AI가 그 사진을 보고 **"아 이건 세면대 누수 문제군요"** 식으로 알아서 분석해 되묻거나 확정안을 만든다.
GPT의 이미지 첨부와 같은 UX.

**핵심: 프론트는 파일을 그대로 보내기만 하면 된다.** 리사이즈·형식 변환·용량 축소는 **전부 백엔드가 한다.**ㄴ

## 어디로 보내나 (엔드포인트)

**기존 메시지 전송 엔드포인트 그대로다. 새 엔드포인트 없음.**

```
POST /api/chat-sessions/{sid}/messages
```

이미 쓰고 있는 `sendMessage(sid, message)`에 `image` 하나만 추가하면 된다.

## 어떤 형태로 보내나 (요청 body)

```jsonc
{
  "message": "이 사진 좀 봐주세요",   // 텍스트. 이미지만 보낼 거면 "" 또는 생략 가능
  "image": {                          // ★ optional — 없으면 기존과 100% 동일
    "data": "data:image/png;base64,iVBORw0KGgo..."   // FileReader.readAsDataURL 결과 그대로
  }
}
```

- **`image`는 선택이다.** 텍스트만 보낼 땐 `image` 필드를 아예 넣지 마라(기존 코드 그대로 동작).
- **`data`는 data URL 통째로** 넣으면 된다 (`data:image/...;base64,...`). 서버가 media_type을 알아서 뽑는다.
  - 나눠 보내고 싶으면 `{ "media_type": "image/jpeg", "data": "<base64만>" }` 도 됨.
- **원본 그대로 OK.** 8MB짜리 폰 사진도 그냥 보내면 서버가 알아서 1024px/JPEG로 줄인다. 프론트에서 canvas 리사이즈 같은 거 하지 마라.

### 프론트 코드 예시 (참고)

```js
// api/session.js — image 인자만 추가
export const sendMessage = (sid, message, image = null) =>
  request("POST", `/chat-sessions/${sid}/messages`, {
    body: image ? { message, image } : { message },
  });

// +버튼 핸들러: 파일 → data URL → 그대로 전송
const onPickImage = (file) => {
  const reader = new FileReader();
  reader.onload = () => sendMessage(sid, input, { data: reader.result });
  reader.readAsDataURL(file);   // "data:image/...;base64,..." 를 만들어준다
};
```

`<input type="file" accept="image/*" />` 를 +버튼에 연결하면 끝. (모바일은 카메라도 열림)

## 응답은 뭐가 오나

**기존 `sendMessage` 응답과 똑같다.** 이미지를 보냈든 안 보냈든 형태 동일:

```jsonc
// 되묻는 경우
{ "is_complete": false, "step": "location",
  "question": "사진 속 세면대 문제가 어느 건물·층인가요?",
  "choices": ["학생회관 2층", "본관 1층", "...", "직접 입력"] }

// 확정된 경우
{ "is_complete": true, "step": "confirm",
  "preview": { "category": "위생 / 배관", "location": "...", "refined_title": "...", "refined_body": "..." } }
```

→ 화면 분기 로직을 새로 만들 필요 없다. 지금 `is_complete`로 가르는 그대로.

## 지원 형식 / 제약

| 항목 | 값 |
|---|---|
| 형식 | jpeg / png / gif / webp (accept="image/*" 로 충분) |
| 장수 | **한 번에 1장** (여러 장은 아직 미지원) |
| 크기 | 원본 상한 약 15MB. 그 이상이면 400 |
| 처리 | 서버가 1024px·JPEG로 축소 후 AI에 전달 |

## 에러 처리

기존 에러 코드 분기에 아래만 알면 된다. 전부 `error.message`를 그대로 보여주면 된다.

| 상황 | 코드 / HTTP | 프론트가 할 일 |
|---|---|---|
| 형식·크기 위반, 깨진 이미지 | 400 (일반 DomainError) | "사진을 처리할 수 없어요" 안내 |
| AI 호출 실패 | `BEDROCK_ERROR` / 502 | 기존과 동일 — 재시도 안내 (대화는 남아 있음) |

## 하지 말 것

- ❌ 프론트에서 리사이즈/압축/포맷 변환 — 서버가 한다
- ❌ 이미지 전용 엔드포인트 찾기 — 없다, 메시지 엔드포인트 그대로
- ❌ 이미지를 여러 장 배열로 보내기 — 1장만
- ❌ 서버가 이미지 원본을 저장한다고 가정 — **원본은 저장 안 한다.** 그 턴 분석에만 쓰고 버린다(익명성).

## 사진 내용은 다음 턴에도 이어진다 (프론트는 신경 안 써도 됨)

이미지가 온 턴에 AI가 **사진에서 찾은 시설 문제를 글로 남기도록** 돼 있어(예: "사진에서 세면대
수도꼭지 누수가 확인됩니다"), 그 관찰이 대화 기록에 텍스트로 저장된다. 그래서 다음 턴에 사진을
다시 보내지 않아도 **확정안(제목·본문)에 사진에서 본 문제가 그대로 반영된다.**
→ 프론트는 **사진을 한 번만 보내면 된다.** 후속 턴에 같은 사진을 재전송할 필요 없다.

## 요약 한 줄

> **`sendMessage`에 `image: { data: <파일의 data URL> }` 만 optional로 얹으면 끝.** 나머진 서버가 다 한다.

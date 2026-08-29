# components/chat/ — 민원 작성 챗봇

- `ChatModal.jsx` — 이 서비스의 핵심 화면. 열릴 때 `createSession()`으로 세션을 만들고,
  이후 모든 발화를 `sendMessage(sid, text, image?)`로 보낸다. 확정안이 오면 요약 카드를
  띄우고, "접수하기"가 `submitSession(sid)`을 부른다.
- `SubmitSuccessModal.jsx` — 접수 완료 화면.

## 이 화면이 하지 않는 것

**단계를 몰지 않는다.** 몇 번 되물을지, 지금이 어느 단계인지는 모델이 정하고 서버가 알려준다
(`is_complete`·`step`·`choices`). 브라우저가 `idle→location→detail` 같은 순서를 강제하면
학생이 첫 문장에 다 적었을 때도 쓸데없이 되묻게 된다.

**칩을 만들지 않는다.** 선택지는 서버가 준 `choices`를 그대로 그린다. 칩을 누르는 것도
그냥 그 문구를 `sendMessage`로 보내는 것이다 — 선택 전용 API는 없다.

**카테고리를 추측하지 않는다.** 정규식으로 분류하면 정본 8종과 어긋나는 값이 생긴다.

## 이미지 첨부

`+` 버튼 → `FileReader.readAsDataURL` → `sendMessage(sid, text, { data })`.
**리사이즈·형식 변환은 서버가 한다**(1024px·JPEG). 원본을 그대로 보내면 된다.
서버는 원본을 저장하지 않고 그 턴 분석에만 쓴다.

## 되돌아가기

"수정하기"는 별도 API가 아니라 **고치고 싶다는 말을 그대로 보내는 것**이다.
수정 전용 경로를 두면 대화 기록과 실제 상태가 갈라진다.

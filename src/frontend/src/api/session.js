// 대화 세션 API (학생). 정본: docs/api-contract.md #8~#11.
// 백엔드 app/api/routes/session.py 와 짝.
import { request } from "./client.js";

export const createSession = () => request("POST", "/chat-sessions"); // → { session_id }
export const listSessions = () => request("GET", "/chat-sessions"); // → SessionSummary[]
export const getSession = (sid) => request("GET", `/chat-sessions/${sid}`); // → SessionDetail
// image는 선택. 있으면 { data: "data:image/...;base64,..." } 를 그대로 실어 보낸다.
// 리사이즈·형식 변환·용량 축소는 전부 백엔드가 한다 (docs/frontend-image-attach.md).
export const sendMessage = (sid, message, image = null) =>
  request("POST", `/chat-sessions/${sid}/messages`, {
    body: image ? { message, image } : { message },
  }); // → RefineResult
export const submitSession = (sid) =>
  request("POST", `/chat-sessions/${sid}/submit`); // → { complaint_id, next_session_id }

// 주의 (api-contract.md):
// - sendMessage 응답의 is_complete로 화면을 가른다: false면 질문+칩, true면 미리보기 카드.
// - 칩을 누르는 것도 sendMessage다 (선택 전용 API 없음). 몇 단계가 될지는 서버(모델)가 정한다.
// - 접수는 "이대로 접수하시겠습니까?" 확인창을 거친 뒤에만 submitSession 호출.

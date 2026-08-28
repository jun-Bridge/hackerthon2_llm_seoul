// 게시판 API (학생·관리자 공용 조회 + 학생 철회). 정본: docs/api-contract.md #12~#15.
// 백엔드 app/api/routes/board.py 와 짝.
import { request } from "./client.js";

export const listComplaints = (status = null) =>
  request("GET", "/complaints", { query: status ? { status } : undefined }); // → Complaint[]
export const getComplaint = (id) => request("GET", `/complaints/${id}`); // → Complaint
export const getComplaintConversation = (id) =>
  request("GET", `/complaints/${id}/conversation`); // → ConversationTurn[]
export const withdrawComplaint = (id, password) =>
  request("POST", `/complaints/${id}/withdraw`, { body: { password } });

// 주의:
// - Complaint.is_mine === true 일 때만 철회 버튼을 그린다 (작성자 id는 응답에 없다).
// - 목록 응답의 comments에는 보류 사유만 담긴다. "코멘트 N개"를 카드에서 세면 안 된다.
// - 철회는 3단계: ① 경고+비밀번호 ② 최종 확인창 ③ withdrawComplaint 호출.

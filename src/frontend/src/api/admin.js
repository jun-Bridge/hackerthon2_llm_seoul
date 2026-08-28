// 관리자 API. 정본: docs/api-contract.md #16~#23.
// 백엔드 app/api/routes/admin.py 와 짝. 학생 계정이 부르면 403.
import { request } from "./client.js";

export const getStats = () => request("GET", "/admin/stats"); // → { total, by_status }
export const openComplaint = (id) => request("POST", `/admin/complaints/${id}/open`); // → Complaint (★ 확인 자동 전환)
export const acceptComplaint = (id) => request("POST", `/admin/complaints/${id}/accept`); // 확인 → 처리중
export const resolveComplaint = (id) => request("POST", `/admin/complaints/${id}/resolve`); // 처리중 → 해결완료
export const holdComplaint = (id, reason) =>
  request("POST", `/admin/complaints/${id}/hold`, { body: { reason } }); // 확인 → 보류 (사유 필수)
export const rejectComplaint = (id) => request("POST", `/admin/complaints/${id}/reject`); // 확인 → 거절
export const addComment = (id, content) =>
  request("POST", `/admin/complaints/${id}/comments`, { body: { content } });
export const getBedrockLogs = (limit = 50) =>
  request("GET", "/admin/bedrock-logs", { query: { limit } });

// 주의:
// - openComplaint는 GET이 아니라 POST다. 상세 열람에 '미확인→확인' 부작용이 있어서,
//   GET이면 브라우저 프리페치가 열지도 않은 민원을 확인 처리한다.
// - 결정 버튼은 상태에 따라 노출: 확인이면 accept/hold/reject, 처리중이면 resolve만.
// - 상태 변경 응답은 갱신된 Complaint. 상세는 이걸로 갈아끼우고, 목록·통계만 다시 받는다.

// 인증 API. 정본: docs/api-contract.md #1~#7.
// 백엔드 app/api/routes/{auth,schools}.py 와 짝.
import { request } from "./client.js";

export const listSchools = () => request("GET", "/schools"); // → School[]
export const signup = (email, password, adminCode = null) =>
  request("POST", "/auth/signup", { body: { email, password, admin_code: adminCode } }); // → { user_id, role }
export const login = (email, password) =>
  request("POST", "/auth/login", { body: { email, password } }); // → Me
export const logout = () => request("POST", "/auth/logout");
export const getMe = () => request("GET", "/auth/me"); // → Me (401이면 호출부에서 null 처리)
export const changePassword = (currentPassword, newPassword) =>
  request("PATCH", "/auth/password", { body: { current_password: currentPassword, new_password: newPassword } });
export const deleteAccount = (password) =>
  request("DELETE", "/auth/me", { body: { password } });
// 되돌릴 수 없는 동작(철회·탈퇴) 전 본인 확인. 아무것도 바꾸지 않음. 틀리면 401 WRONG_PASSWORD.
export const verifyPassword = (password) =>
  request("POST", "/auth/verify-password", { body: { password } });

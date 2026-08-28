// 백엔드 호출 래퍼. 여기만 fetch를 안다.
// 정본: docs/api-contract.md 5장.
//
// 22개 도메인 함수가 각자 credentials·CSRF 헤더를 붙이면 하나는 반드시 빠뜨린다.
// 전부 이 request()를 거친다. 401(UNAUTHENTICATED)만 여기서 로그인 화면으로 보내고,
// WRONG_PASSWORD·INVALID_CREDENTIALS 같은 다른 401은 화면이 처리하도록 코드로 가른다.

const BASE = "/api";

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * @param {'GET'|'POST'|'PATCH'|'DELETE'} method
 * @param {string} path   '/complaints/12' 처럼 BASE 뒤 경로
 * @param {{body?: object, query?: object}} [opts]
 * @returns {Promise<any>}  204면 undefined
 * @throws  {ApiError}      2xx가 아니면 전부 여기로
 */
export async function request(method, path, { body, query } = {}) {
  const url = BASE + path + (query ? "?" + new URLSearchParams(query) : "");
  const res = await fetch(url, {
    method,
    credentials: "include", // 쿠키 세션 — 모든 요청 필수
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "fetch", // CSRF 대비
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    const data = await res.json().catch(() => ({}));
    if (data.error?.code === "UNAUTHENTICATED") {
      // TODO: 로그인 화면으로 리다이렉트 (라우터 연동 시 구현)
    }
    throw new ApiError(401, data.error?.code ?? "UNAUTHENTICATED", data.error?.message ?? "");
  }
  if (res.status === 204) return undefined;

  const data = await res.json();
  if (!res.ok) throw new ApiError(res.status, data.error.code, data.error.message);
  return data;
}

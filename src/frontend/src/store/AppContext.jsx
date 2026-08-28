import { createContext, useContext, useState, useCallback } from "react";
import { listComplaints as apiListComplaints, withdrawComplaint } from "../api/board";
import {
  getStats as apiGetStats,
  acceptComplaint,
  resolveComplaint,
  holdComplaint,
  rejectComplaint,
} from "../api/admin";
import { formatDate } from "./constants";

// 백엔드 연동 상태 허브. 데모/샘플 데이터를 넣지 않는다 —
// 목록이 비면 "민원이 없다"가 진실이고, 가짜로 채우면 빈 게시판과 장애를 구분할 수 없다.
const AppContext = createContext(null);

// 백엔드 ComplaintOut → 화면이 쓰는 형태로 정규화.
// UI 컴포넌트들이 timestamp/rawText/summary 라는 이름으로 읽고 있어서, 원본 필드를
// 유지한 채 별칭을 덧붙인다. (정본 필드는 created_at / body — api-contract.md 0장)
function normalize(c) {
  if (!c) return c;
  return {
    ...c,
    timestamp: formatDate(c.created_at),
    rawText: c.body,
    summary: c.body,
  };
}

export function AppProvider({ children }) {
  const [user, setUser] = useState(null); // { user_id, email, role, school_name }
  const [complaints, setComplaints] = useState([]); // 정규화된 ComplaintOut[]
  const [stats, setStats] = useState(null); // { total, by_status }

  // 게시판 목록 새로 받기 (status/category 필터 옵션)
  const refreshComplaints = useCallback(async (opts = {}) => {
    const rows = await apiListComplaints(opts.status ?? null, opts.category ?? null);
    const list = (rows || []).map(normalize);
    setComplaints(list);
    return list;
  }, []);

  // 관리자 통계 새로 받기
  const refreshStats = useCallback(async () => {
    const s = await apiGetStats();
    setStats(s);
    return s;
  }, []);

  // 상태 변경/철회 후 응답으로 목록의 해당 항목만 갈아끼운다
  const replaceComplaint = useCallback((updated) => {
    const u = normalize(updated);
    setComplaints((prev) => prev.map((c) => (c.id === u.id ? u : c)));
    return u;
  }, []);

  const removeComplaint = useCallback((id) => {
    setComplaints((prev) => prev.filter((c) => c.id !== id));
  }, []);

  // 관리자 상태 전이. 화면은 "다음 상태" 하나로 부르지만 백엔드는 전이별 엔드포인트가
  // 따로 있고 선행 상태를 WHERE로 검증한다. 여기서 갈라준다.
  // 보류·거절은 사유가 필수다(없으면 서버가 422). 호출부가 반드시 reason을 넘겨야 한다.
  const changeStatus = useCallback(
    async (id, nextStatus, reason = "") => {
      let updated;
      switch (nextStatus) {
        case "처리중":
          updated = await acceptComplaint(id);
          break;
        case "해결완료":
          updated = await resolveComplaint(id);
          break;
        case "보류":
          updated = await holdComplaint(id, reason);
          break;
        case "거절":
          updated = await rejectComplaint(id, reason);
          break;
        default:
          // '확인'은 버튼이 아니라 상세 열람(POST open)의 부작용이다 — 여기로 오면 안 된다.
          throw new Error(`지원하지 않는 상태 전이: ${nextStatus}`);
      }
      const u = replaceComplaint(updated);
      refreshStats().catch(() => {});
      return u;
    },
    [replaceComplaint, refreshStats],
  );

  // 학생 철회의 실행 단계(③). 앞의 두 단계 — ① 비밀번호 확인(verifyPassword)
  // ② 최종 확인창 — 은 화면이 담당한다. 서버도 여기서 비밀번호를 다시 검증하므로
  // ①을 건너뛰고 이걸 직접 불러도 뚫리지 않는다.
  const deleteComplaint = useCallback(
    async (id, password) => {
      await withdrawComplaint(id, password);
      removeComplaint(id);
    },
    [removeComplaint],
  );

  return (
    <AppContext.Provider
      value={{
        user,
        setUser,
        complaints,
        setComplaints,
        refreshComplaints,
        stats,
        refreshStats,
        replaceComplaint,
        removeComplaint,
        changeStatus,
        deleteComplaint,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}

import { createContext, useContext, useState, useCallback } from "react";
import { listComplaints as apiListComplaints } from "../api/board";
import { getStats as apiGetStats } from "../api/admin";

const DEMO_COMPLAINTS = [
  {
    id: 1,
    title: "공학관 3층 에어컨이 작동하지 않아요",
    location: "공학관 3층",
    category: "냉난방 / 공조",
    status: "처리중",
    created_at: "2026-08-20T10:00:00Z",
    timestamp: "2026.08.20",
    is_mine: false,
    summary: "에어컨이 약하게만 작동하고 냉기가 거의 나오지 않습니다.",
    rawText:
      "공학관 3층 강의실 에어컨이 약하게만 작동하고 있습니다. 냉기가 거의 나오지 않아 수업 중 불편함이 큽니다.",
  },
  {
    id: 2,
    title: "학생회관 화장실 세면대에서 물이 새고 있어요",
    location: "학생회관 2층",
    category: "위생 / 배관",
    status: "해결완료",
    created_at: "2026-08-18T14:30:00Z",
    timestamp: "2026.08.18",
    is_mine: true,
    summary: "세면대 밑 배관에서 물이 새고 있어 보수 중입니다.",
    rawText:
      "학생회관 2층 남녀 화장실 세면대 밑에서 물이 계속 새고 있습니다. 즉시 점검 부탁드립니다.",
  },
  {
    id: 3,
    title: "중앙도서관 4층 조명이 너무 어두워요",
    location: "중앙도서관 4층",
    category: "전기 / 설비",
    status: "미확인",
    created_at: "2026-08-17T09:20:00Z",
    timestamp: "2026.08.17",
    is_mine: false,
    summary: "조명이 너무 어두워서 열람 시 불편함이 큽니다.",
    rawText:
      "중앙도서관 4층 열람실 조명이 너무 어두워 책을 읽기 어렵습니다. 조도 점검이 필요합니다.",
  },
  {
    id: 4,
    title: "본관 자동문이 멈춰서 불편합니다",
    location: "본관 정문",
    category: "안전 / 보안",
    status: "처리중",
    created_at: "2026-08-16T16:55:00Z",
    timestamp: "2026.08.16",
    is_mine: false,
    summary: "자동문이 자주 멈추고 있어 출입이 불편합니다.",
    rawText:
      "본관 정문 자동문이 자주 멈춰 학생들이 문을 밀고 들어가야 하는 상황이 반복됩니다.",
  },
  {
    id: 5,
    title: "실습실 와이파이가 자주 끊겨요",
    location: "공학관 5층",
    category: "통신 / 인터넷",
    status: "보류",
    created_at: "2026-08-15T11:40:00Z",
    timestamp: "2026.08.15",
    is_mine: false,
    summary: "와이파이 연결이 끊기고 재연결이 자주 일어납니다.",
    rawText:
      "실습실 와이파이가 자주 끊기고 연결이 풀려 수업과 과제 수행에 불편이 있습니다.",
  },
];

// 백엔드 연동 상태 허브. 샘플 데이터 없음 — 실제 API에서 받아온다.
const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [user, setUser] = useState(null); // { user_id, email, role, school_name }
  const [complaints, setComplaints] = useState(DEMO_COMPLAINTS); // ComplaintOut[]
  const [stats, setStats] = useState(null); // { total, by_status }

  // 게시판 목록 새로 받기 (status/category 필터 옵션)
  const refreshComplaints = useCallback(async (opts = {}) => {
    try {
      const rows = await apiListComplaints(
        opts.status ?? null,
        opts.category ?? null,
      );
      setComplaints(rows && rows.length ? rows : DEMO_COMPLAINTS);
      return rows && rows.length ? rows : DEMO_COMPLAINTS;
    } catch {
      setComplaints(DEMO_COMPLAINTS);
      return DEMO_COMPLAINTS;
    }
  }, []);

  // 관리자 통계 새로 받기
  const refreshStats = useCallback(async () => {
    const s = await apiGetStats();
    setStats(s);
    return s;
  }, []);

  // 상태 변경/철회 후 응답으로 목록의 해당 항목만 갈아끼운다
  const replaceComplaint = useCallback((updated) => {
    setComplaints((prev) =>
      prev.map((c) => (c.id === updated.id ? updated : c)),
    );
  }, []);

  const removeComplaint = useCallback((id) => {
    setComplaints((prev) => prev.filter((c) => c.id !== id));
  }, []);

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
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}

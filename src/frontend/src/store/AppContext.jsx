import { createContext, useContext, useState, useCallback } from 'react';
import { listComplaints as apiListComplaints } from '../api/board';
import { getStats as apiGetStats } from '../api/admin';

// 백엔드 연동 상태 허브. 샘플 데이터 없음 — 실제 API에서 받아온다.
const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);            // { user_id, email, role, school_name }
  const [complaints, setComplaints] = useState([]);  // ComplaintOut[]
  const [stats, setStats] = useState(null);          // { total, by_status }

  // 게시판 목록 새로 받기 (status/category 필터 옵션)
  const refreshComplaints = useCallback(async (opts = {}) => {
    const rows = await apiListComplaints(opts.status ?? null, opts.category ?? null);
    setComplaints(rows);
    return rows;
  }, []);

  // 관리자 통계 새로 받기
  const refreshStats = useCallback(async () => {
    const s = await apiGetStats();
    setStats(s);
    return s;
  }, []);

  // 상태 변경/철회 후 응답으로 목록의 해당 항목만 갈아끼운다
  const replaceComplaint = useCallback((updated) => {
    setComplaints(prev => prev.map(c => (c.id === updated.id ? updated : c)));
  }, []);

  const removeComplaint = useCallback((id) => {
    setComplaints(prev => prev.filter(c => c.id !== id));
  }, []);

  return (
    <AppContext.Provider value={{
      user, setUser,
      complaints, setComplaints, refreshComplaints,
      stats, refreshStats,
      replaceComplaint, removeComplaint,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}

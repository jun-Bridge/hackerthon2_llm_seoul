import { createContext, useContext, useState } from 'react';

const AppContext = createContext(null);

// 샘플 데이터 (백엔드 연동 전 프로토타입용)
const sampleComplaints = [
  { id: 204, category: '냉난방 / 설비', location: '소프트웨어관 4층 402호',
    rawText: '에어컨에서 소리나고 안 시원해요', title: '소프트웨어관 4층 냉방기기 소음 및 성능 저하 점검',
    summary: '에어컨 가동 시 진동 소음 및 냉각 불량', timestamp: '2025.05.20', status: '미확인', isMine: true },
  { id: 203, category: '배관 / 위생', location: '공학관 2층 남자화장실',
    rawText: '세면대 아래로 물이 새요', title: '공학관 2층 화장실 세면대 배관 누수 점검',
    summary: '세면대 하부 배관 패킹 노후 누수', timestamp: '2025.05.19', status: '해결완료', isMine: true },
  { id: 201, category: '공간 / 편의', location: '중앙도서관 3열람실',
    rawText: '자리 맡아두고 안 오는 사람들 짐 치워주세요', title: '중앙도서관 3열람실 사석화 방지 계도',
    summary: '좌석 무단 방치로 이용 차질', timestamp: '2025.05.18', status: '보류', isMine: false },
  { id: 202, category: '기자재 / 영상', location: '인문관 B102호',
    rawText: '프로젝터 화면이 자주 꺼져요', title: '인문관 B102호 프로젝터 전원 차단 점검',
    summary: '프로젝터 가동 중 과열 차단 반복', timestamp: '2025.05.17', status: '미확인', isMine: false },
  { id: 205, category: '전기 / 설비', location: '도서관 열람실 2층',
    rawText: '콘센트가 작동하지 않는 좌석이 있어요', title: '도서관 2층 열람실 콘센트 전력 단전 점검',
    summary: '매립형 콘센트 전력 공급 중단', timestamp: '2025.05.15', status: '처리중', isMine: true },
];

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [complaints, setComplaints] = useState(sampleComplaints);

  const addComplaint = (complaint) => setComplaints(prev => [complaint, ...prev]);
  const changeStatus = (id, newStatus) => setComplaints(prev => prev.map(c => c.id === id ? { ...c, status: newStatus } : c));
  const deleteComplaint = (id) => setComplaints(prev => prev.filter(c => c.id !== id));

  return (
    <AppContext.Provider value={{ user, setUser, complaints, addComplaint, changeStatus, deleteComplaint }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}

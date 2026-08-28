import { useState, useEffect } from 'react';
import { useApp } from '../store/AppContext';
import Header from '../components/common/Header';
import BottomNav from '../components/common/BottomNav';
import HomePage from './HomePage';
import StatusPage from './StatusPage';
import BoardPage from './BoardPage';
import AdminPage from './AdminPage';
import ProfilePage from './ProfilePage';
import ChatModal from '../components/chat/ChatModal';

export default function MainPage() {
  const { user, refreshComplaints, refreshStats } = useApp();
  const isAdmin = user?.role === 'admin';
  // 관리자는 민원을 접수하지 않는다 — 첫 화면을 관리 대시보드로 연다.
  const [tab, setTab] = useState(isAdmin ? 'admin' : 'home');
  const [chatOpen, setChatOpen] = useState(false);
  const [initialCategory, setInitialCategory] = useState(null);  // 카테고리 프리셋(홈 아이콘 클릭 시)

  const openChat = (category = null) => {
    if (isAdmin) return;   // 관리자는 채팅(민원 접수) 진입 불가 — 백엔드도 require_student
    setInitialCategory(typeof category === 'string' ? category : null);
    setChatOpen(true);
  };

  // 로그인 직후 실제 게시판 목록을 백엔드에서 받아온다. 관리자면 통계도.
  useEffect(() => {
    refreshComplaints().catch(() => {});
    if (isAdmin) refreshStats().catch(() => {});
  }, [refreshComplaints, refreshStats, isAdmin]);

  // 챗봇으로 새 민원 접수가 끝나면 목록을 갱신한다.
  const handleChatClose = (submitted) => {
    setChatOpen(false);
    if (submitted) {
      refreshComplaints().catch(() => {});
      if (isAdmin) refreshStats().catch(() => {});
    }
  };

  const renderPage = () => {
    switch (tab) {
      // 관리자의 홈은 학생용 접수 화면이 아니라 관리 대시보드다.
      case 'home': return isAdmin ? <AdminPage /> : <HomePage onOpenChat={openChat} />;
      case 'status': return <StatusPage />;
      case 'board': return <BoardPage />;
      case 'admin': return <AdminPage />;
      case 'profile': return <ProfilePage />;
      default: return isAdmin ? <AdminPage /> : <HomePage onOpenChat={openChat} />;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'transparent' }}>
      {tab !== 'profile' && <Header onProfileClick={() => setTab('profile')} />}
      <div className="page-body">{renderPage()}</div>
      <BottomNav currentTab={tab} onTabChange={setTab} isAdmin={isAdmin} onFabClick={() => openChat()} />
      {chatOpen && <ChatModal initialCategory={initialCategory} onClose={handleChatClose} />}
    </div>
  );
}

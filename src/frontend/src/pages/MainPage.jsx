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
  const [tab, setTab] = useState('home');
  const [chatOpen, setChatOpen] = useState(false);
  const isAdmin = user?.role === 'admin';

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
      case 'home': return <HomePage onOpenChat={() => setChatOpen(true)} />;
      case 'status': return <StatusPage />;
      case 'board': return <BoardPage />;
      case 'admin': return <AdminPage />;
      case 'profile': return <ProfilePage />;
      default: return <HomePage onOpenChat={() => setChatOpen(true)} />;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'transparent' }}>
      {tab !== 'profile' && <Header onProfileClick={() => setTab('profile')} />}
      <div className="page-body">{renderPage()}</div>
      <BottomNav currentTab={tab} onTabChange={setTab} isAdmin={isAdmin} onFabClick={() => setChatOpen(true)} />
      {chatOpen && <ChatModal onClose={handleChatClose} />}
    </div>
  );
}

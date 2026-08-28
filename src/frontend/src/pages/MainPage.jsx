import { useState } from 'react';
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
  const { user } = useApp();
  const [tab, setTab] = useState('home');
  const [chatOpen, setChatOpen] = useState(false);
  const isAdmin = user?.role === 'admin' || user?.role === 'staff';

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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#FFFFFF' }}>
      {tab !== 'profile' && <Header onProfileClick={() => setTab('profile')} />}
      <div className="page-body">{renderPage()}</div>
      <BottomNav currentTab={tab} onTabChange={setTab} isAdmin={isAdmin} onFabClick={() => setChatOpen(true)} />
      {chatOpen && <ChatModal onClose={() => setChatOpen(false)} />}
    </div>
  );
}

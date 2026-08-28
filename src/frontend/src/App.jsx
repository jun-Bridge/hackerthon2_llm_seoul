import { useState, useEffect } from 'react';
import { AppProvider, useApp } from './store/AppContext';
import { ToastProvider } from './components/common/Toast';
import { getMe } from './api/auth';
import SplashPage from './pages/SplashPage';
import AuthPage from './pages/AuthPage';
import MainPage from './pages/MainPage';

function AppRoot() {
  const { user, setUser } = useApp();
  const [screen, setScreen] = useState('splash');
  const [checking, setChecking] = useState(true);

  // 앱 시작 시 기존 로그인 세션(쿠키) 복원 — 새로고침해도 로그인 유지
  useEffect(() => {
    getMe()
      .then((me) => { if (me) setUser(me); })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, [setUser]);

  if (checking) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8' }}>불러오는 중…</div>;
  if (user) return <MainPage />;
  if (screen === 'splash') return <SplashPage onStart={() => setScreen('auth')} />;
  return <AuthPage onBack={() => setScreen('splash')} onLoginSuccess={() => {}} />;
}

export default function App() {
  return (
    <AppProvider>
      <ToastProvider>
        <div className="app-frame">
          <AppRoot />
        </div>
      </ToastProvider>
    </AppProvider>
  );
}

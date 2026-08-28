import { useState } from 'react';
import { AppProvider, useApp } from './store/AppContext';
import SplashPage from './pages/SplashPage';
import AuthPage from './pages/AuthPage';
import MainPage from './pages/MainPage';

function AppRoot() {
  const { user } = useApp();
  const [screen, setScreen] = useState('splash');

  if (user) return <MainPage />;
  if (screen === 'splash') return <SplashPage onStart={() => setScreen('auth')} />;
  return <AuthPage onBack={() => setScreen('splash')} onLoginSuccess={() => {}} />;
}

export default function App() {
  return (
    <AppProvider>
      <AppRoot />
    </AppProvider>
  );
}

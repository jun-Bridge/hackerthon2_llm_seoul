import { useState, useEffect } from "react";
import { AppProvider, useApp } from "./store/AppContext";
import { ToastProvider } from "./components/common/Toast";
import { getMe } from "./api/auth";
import LandingPage from "./pages/LandingPage";
import AuthPage from "./pages/AuthPage";
import MainPage from "./pages/MainPage";

function AppRoot() {
  const { user, setUser } = useApp();
  const [screen, setScreen] = useState("landing");
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const minDelay = new Promise((r) => setTimeout(r, 800));
    const auth = getMe()
      .then((me) => {
        if (me) setUser(me);
      })
      .catch(() => {});
    Promise.all([minDelay, auth]).finally(() => setChecking(false));
  }, [setUser]);

  // 로그아웃(user → null)하면 로그인 화면에 머무르지 않고 랜딩으로 되돌린다.
  useEffect(() => {
    if (!user) setScreen("landing");
  }, [user]);

  // 로딩 프레임 애니메이션 (run-1 ~ run-8)
  const [runFrame, setRunFrame] = useState(1);
  useEffect(() => {
    if (!checking) return;
    const timer = setInterval(() => {
      setRunFrame((f) => (f % 8) + 1);
    }, 100);
    return () => clearInterval(timer);
  }, [checking]);

  if (checking)
    return (
      <div
        style={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "16px",
          background: "transparent",
        }}
      >
        <img
          src={`/run-${runFrame}.png`}
          alt="다듬이 달리는 중"
          style={{
            width: "100px",
            height: "100px",
            objectFit: "contain",
          }}
        />
        <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
          <span
            style={{ fontSize: "0.9rem", fontWeight: 700, color: "#475569" }}
          >
            불러오는 중
          </span>
          <span className="typing-dots" style={{ marginLeft: "4px" }}>
            <span></span>
            <span></span>
            <span></span>
          </span>
        </div>
      </div>
    );
  if (user) return <MainPage />;
  if (screen === "auth")
    return (
      <AuthPage onBack={() => setScreen("landing")} onLoginSuccess={() => {}} />
    );
  // 비로그인: 랜딩. 로그인하지 않은 사람에게 앱 화면을 보여주지 않는다 —
  // 보여주려면 가짜 데이터를 채워야 하고, 그러면 로그아웃해도 앱이 그대로인 것처럼 보인다.
  return <LandingPage onLogin={() => setScreen("auth")} />;
}

export default function App() {
  return (
    <AppProvider>
        <div className="app-frame">
          <ToastProvider>
            <AppRoot />
          </ToastProvider>
        </div>
    </AppProvider>
  );
}

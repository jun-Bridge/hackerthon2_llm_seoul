import { useState, useEffect } from "react";
import { useApp } from "../store/AppContext";
import Header from "../components/common/Header";
import BottomNav from "../components/common/BottomNav";
import HomePage from "./HomePage";
import StatusPage from "./StatusPage";
import BoardPage from "./BoardPage";
import AdminPage from "./AdminPage";
import ProfilePage from "./ProfilePage";
import ChatModal from "../components/chat/ChatModal";

export default function MainPage({ isGuest, onRequestLogin }) {
  const { user, refreshComplaints, refreshStats } = useApp();
  const [tab, setTab] = useState("home");
  const [chatOpen, setChatOpen] = useState(false);
  const [selectedComplaintId, setSelectedComplaintId] = useState(null);
  const isAdmin = user?.role === "admin";

  // 게스트 모드: 인터랙션 차단
  const guardAction = (action) => {
    if (isGuest) {
      if (onRequestLogin) onRequestLogin();
      return;
    }
    action();
  };

  // 로그인 직후 실제 게시판 목록을 백엔드에서 받아온다. 관리자면 통계도.
  useEffect(() => {
    if (isGuest) return;
    refreshComplaints().catch(() => {});
    if (isAdmin) refreshStats().catch(() => {});
  }, [refreshComplaints, refreshStats, isAdmin, isGuest]);

  // 챗봇으로 새 민원 접수가 끝나면 목록을 갱신한다.
  const handleChatClose = (submitted) => {
    setChatOpen(false);
    if (submitted) {
      refreshComplaints().catch(() => {});
      if (isAdmin) refreshStats().catch(() => {});
    }
  };

  const handleTabChange = (nextTab, complaintId = null) => {
    guardAction(() => {
      setTab(nextTab);
      setSelectedComplaintId(complaintId);
    });
  };

  const renderPage = () => {
    switch (tab) {
      case "home":
        return (
          <HomePage
            onOpenChat={() => guardAction(() => setChatOpen(true))}
            onTabChange={handleTabChange}
            isGuest={isGuest}
          />
        );
      case "status":
        return <StatusPage />;
      case "board":
        return (
          <BoardPage
            initialSelectedComplaintId={selectedComplaintId}
            onDetailClose={() => setSelectedComplaintId(null)}
          />
        );
      case "admin":
        return <AdminPage />;
      case "profile":
        return <ProfilePage />;
      default:
        return <HomePage onOpenChat={() => setChatOpen(true)} />;
    }
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background:
          "linear-gradient(180deg, #BFDBFE 0%, #DBEAFE 15%, #EFF6FF 32%, #F8FAFC 52%, #FFFFFF 100%)",
      }}
    >
      {tab === "home" && <Header onProfileClick={() => setTab("profile")} />}
      <div
        className="page-body"
        style={
          tab === "profile" ||
          tab === "admin" ||
          tab === "board" ||
          tab === "status"
            ? {
                background: "#FFFFFF",
                padding: tab === "profile" ? 0 : undefined,
              }
            : {}
        }
      >
        {renderPage()}
      </div>
      <BottomNav
        currentTab={tab}
        onTabChange={(t) => guardAction(() => setTab(t))}
        isAdmin={isAdmin}
        onFabClick={() => guardAction(() => setChatOpen(true))}
      />
      {chatOpen && <ChatModal onClose={handleChatClose} />}
    </div>
  );
}

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

export default function MainPage() {
  const { user, refreshComplaints, refreshStats } = useApp();
  const [tab, setTab] = useState("home");
  const [chatOpen, setChatOpen] = useState(false);
  const [selectedComplaintId, setSelectedComplaintId] = useState(null);
  const isAdmin = user?.role === "admin";

  // 로그인 직후 실제 게시판 목록을 백엔드에서 받아온다. 관리자면 통계도.
  useEffect(() => {

    refreshComplaints().catch(() => {});
    if (isAdmin) refreshStats().catch(() => {});
  }, [refreshComplaints, refreshStats, isAdmin]);

  // 챗봇으로 새 민원 접수가 끝나면 목록을 갱신한다.
  const handleChatClose = (result) => {
    setChatOpen(false);
    if (result === "status") {
      setTab("status");
      refreshComplaints().catch(() => {});
    } else if (result) {
      refreshComplaints().catch(() => {});
      if (isAdmin) refreshStats().catch(() => {});
    }
  };

  const handleTabChange = (nextTab, complaintId = null) => {
    setTab(nextTab);
    setSelectedComplaintId(complaintId);
  };

  const renderPage = () => {
    switch (tab) {
      case "home":
        return (
          <HomePage
            onOpenChat={() => setChatOpen(true)}
            onTabChange={handleTabChange}
          />
        );
      case "status":
        return <StatusPage onBack={() => setTab("home")} />;
      case "board":
        return (
          <BoardPage
            initialSelectedComplaintId={selectedComplaintId}
            onDetailClose={() => setSelectedComplaintId(null)}
            onBack={() => setTab("home")}
          />
        );
      case "admin":
        return <AdminPage onBack={() => setTab("home")} />;
      case "profile":
        return <ProfilePage onBack={() => setTab("home")} />;
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
        key={tab}
        className="page-body page-transition"
        style={
          tab === "profile" ||
          tab === "admin" ||
          tab === "board" ||
          tab === "status"
            ? { background: "#FFFFFF", padding: 0 }
            : {}
        }
      >
        {renderPage()}
      </div>
      <BottomNav
        currentTab={tab}
        onTabChange={(t) => setTab(t)}
        isAdmin={isAdmin}
        onFabClick={() => setChatOpen(true)}
      />
      {chatOpen && <ChatModal onClose={handleChatClose} />}
    </div>
  );
}

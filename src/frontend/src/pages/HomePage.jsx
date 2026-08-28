import { useState, useEffect } from "react";
import { useApp } from "../store/AppContext";
import { formatDate } from "../store/constants";
import "../styles/home.css";

const locationPinPositions = {
  "공학관 3층": { top: "30%", left: "28%" },
  "학생회관 2층": { top: "60%", left: "52%" },
  "중앙도서관 4층": { top: "42%", left: "68%" },
  "본관 정문": { top: "74%", left: "38%" },
  "공학관 5층": { top: "18%", left: "62%" },
};

const statusColors = {
  처리중: "#EF4444",
  해결완료: "#10B981",
  미확인: "#F59E0B",
  보류: "#8B5CF6",
};

const demoComplaints = [
  {
    id: 1,
    title: "공학관 3층 에어컨이 작동하지 않아요",
    location: "공학관 3층",
    category: "냉난방 / 공조",
    status: "처리중",
    created_at: "2026-08-20T10:00:00Z",
    is_mine: false,
  },
  {
    id: 2,
    title: "학생회관 화장실 세면대에서 물이 새고 있어요",
    location: "학생회관 2층",
    category: "위생 / 배관",
    status: "해결완료",
    created_at: "2026-08-18T14:30:00Z",
    is_mine: true,
  },
  {
    id: 3,
    title: "중앙도서관 4층 조명이 너무 어두워요",
    location: "중앙도서관 4층",
    category: "전기 / 설비",
    status: "미확인",
    created_at: "2026-08-17T09:20:00Z",
    is_mine: false,
  },
  {
    id: 4,
    title: "본관 자동문이 멈춰서 불편합니다",
    location: "본관 정문",
    category: "안전 / 보안",
    status: "처리중",
    created_at: "2026-08-16T16:55:00Z",
    is_mine: false,
  },
  {
    id: 5,
    title: "실습실 와이파이가 자주 끊겨요",
    location: "공학관 5층",
    category: "통신 / 인터넷",
    status: "보류",
    created_at: "2026-08-15T11:40:00Z",
    is_mine: false,
  },
];

export default function HomePage({ onOpenChat, onTabChange, isGuest }) {
  const { user, complaints } = useApp();
  const activeComplaints = complaints.length ? complaints : demoComplaints;
  const isAdmin = user?.role === "admin" || user?.role === "staff";
  const myList = isGuest ? [] : activeComplaints.filter((c) => c.is_mine);
  const processing = myList.filter((c) => c.status === "처리중").length;
  const done = myList.filter((c) => c.status === "해결완료").length;

  // 게스트: 한국대 캠퍼스 상황만 보여주는 시나리오
  const [guestPosts, setGuestPosts] = useState(demoComplaints);
  const [fadeKey, setFadeKey] = useState(0);
  const [hoveredPinId, setHoveredPinId] = useState(null);

  useEffect(() => {
    if (!isGuest) return;
    const interval = setInterval(() => {
      setGuestPosts((prev) => {
        const next = [...prev];
        const first = next.shift();
        next.push(first);
        return next;
      });
      setFadeKey((k) => k + 1);
    }, 3000);
    return () => clearInterval(interval);
  }, [isGuest]);

  // 게스트: 로그아웃 상태에서는 다른 대학 이름을 돌려서 보여준다
  const universities = [
    "군산대학교",
    "전남대학교",
    "서울대학교",
    "연세대학교",
    "고려대학교",
    "부산대학교",
    "KAIST",
  ];
  const [uniIndex, setUniIndex] = useState(0);

  // 게스트: 숫자 다이얼 롤링
  const [dialNum, setDialNum] = useState(128);

  useEffect(() => {
    if (!isGuest) return;
    const interval = setInterval(() => {
      setUniIndex((i) => (i + 1) % universities.length);
      setDialNum((n) => n + Math.floor(Math.random() * 3) + 1);
    }, 2500);
    return () => clearInterval(interval);
  }, [isGuest]);

  const sourceList = isGuest
    ? guestPosts
    : complaints.length
      ? complaints
      : demoComplaints;
  const displayList = sourceList.slice(0, 5);
  const mapPins = sourceList.map((complaint, index) => {
    const fallbackTop = `${18 + ((index * 17) % 58)}%`;
    const fallbackLeft = `${20 + ((index * 23) % 60)}%`;
    const position = locationPinPositions[complaint.location] || {
      top: fallbackTop,
      left: fallbackLeft,
    };

    return {
      id: complaint.id,
      title: complaint.title,
      location: complaint.location,
      status: complaint.status,
      top: position.top,
      left: position.left,
      color: statusColors[complaint.status] || "#2563EB",
    };
  });

  return (
    <div className="home-page">
      <div className="greeting">
        {isGuest ? (
          <>
            <span
              key={uniIndex}
              style={{
                display: "inline-block",
                animation: "fadeSlide 0.3s ease",
              }}
            >
              {universities[uniIndex]}
            </span>{" "}
            캠퍼스 민원,<span className="greeting-name">다듬이가 해결해요</span>
          </>
        ) : (
          <>
            안녕하세요,
            <span className="greeting-name">
              {user?.email?.split("@")[0] || "student"}님
            </span>
          </>
        )}
      </div>

      <div className="input-trigger" onClick={onOpenChat}>
        <span>불편한 점을 편하게 적어주세요</span>
        <i
          className="bi bi-arrow-right"
          style={{ color: "#2563EB", fontWeight: 700 }}
        ></i>
      </div>

      {/* 한국대 캠퍼스 지도 */}
      <div
        style={{
          width: "100%",
          height: "200px",
          borderRadius: "14px",
          background: "linear-gradient(180deg, #E0F2FE 0%, #E2E8F0 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          overflow: "hidden",
          border: "1px solid rgba(37, 99, 235, 0.08)",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 25% 30%, rgba(59,130,246,0.10), transparent 24%), radial-gradient(circle at 65% 52%, rgba(16,185,129,0.14), transparent 28%), linear-gradient(90deg, rgba(148,163,184,0.10) 0, rgba(148,163,184,0.10) 1px, transparent 1px), linear-gradient(rgba(148,163,184,0.10) 0, rgba(148,163,184,0.10) 1px, transparent 1px)",
            backgroundSize: "100% 100%, 100% 100%, 24px 24px, 24px 24px",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: "14%",
            top: "34%",
            width: "72%",
            height: "46%",
            border: "2px solid rgba(37,99,235,0.25)",
            borderRadius: "24px",
            background: "rgba(255,255,255,0.28)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: "25%",
            top: "48%",
            width: "15%",
            height: "18%",
            borderRadius: "18px",
            background: "rgba(148,163,184,0.18)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: "56%",
            top: "26%",
            width: "19%",
            height: "22%",
            borderRadius: "18px",
            background: "rgba(148,163,184,0.18)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: "46%",
            top: "62%",
            width: "18%",
            height: "16%",
            borderRadius: "18px",
            background: "rgba(148,163,184,0.18)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: "12%",
            top: "18%",
            fontSize: "0.72rem",
            fontWeight: 700,
            color: "#1E3A8A",
          }}
        >
          캠퍼스 지도
        </div>
        {mapPins.map((pin) => {
          const isHovered = hoveredPinId === pin.id;
          return (
            <div
              key={pin.id}
              style={{
                position: "absolute",
                top: pin.top,
                left: pin.left,
                transform: isHovered
                  ? "translate(-50%, -8px) scale(1.12)"
                  : "translate(-50%, 0) scale(1)",
                transition: "transform 0.2s ease, filter 0.2s ease",
                filter: isHovered
                  ? "drop-shadow(0 8px 14px rgba(37,99,235,0.28))"
                  : "drop-shadow(0 4px 8px rgba(15,23,42,0.18))",
                zIndex: isHovered ? 3 : 1,
              }}
            >
              <button
                type="button"
                aria-label={pin.title}
                onClick={() => onTabChange && onTabChange("board", pin.id)}
                onMouseEnter={() => setHoveredPinId(pin.id)}
                onMouseLeave={() => setHoveredPinId(null)}
                onFocus={() => setHoveredPinId(pin.id)}
                onBlur={() => setHoveredPinId(null)}
                style={{
                  display: "block",
                  width: "30px",
                  height: "30px",
                  borderRadius: "50%",
                  border: "2px solid rgba(255,255,255,0.9)",
                  backgroundImage: "url('/dadumi-face-cry.png')",
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  backgroundRepeat: "no-repeat",
                  boxSizing: "border-box",
                  cursor: "pointer",
                  padding: 0,
                  outline: "none",
                  boxShadow: isHovered
                    ? "0 10px 18px rgba(96, 165, 250, 0.35)"
                    : "0 6px 12px rgba(15, 23, 42, 0.18)",
                  transition: "box-shadow 0.2s ease, transform 0.2s ease",
                }}
                title={pin.title}
              />
              {isHovered && (
                <span
                  style={{
                    position: "absolute",
                    left: "50%",
                    top: "calc(100% + 10px)",
                    transform: "translateX(-50%)",
                    whiteSpace: "nowrap",
                    background: "rgba(15,23,42,0.84)",
                    color: "#FFFFFF",
                    fontSize: "0.7rem",
                    fontWeight: 700,
                    lineHeight: 1.2,
                    padding: "6px 8px",
                    borderRadius: "8px",
                    letterSpacing: "-0.01em",
                    boxShadow: "0 8px 18px rgba(15,23,42,0.18)",
                  }}
                >
                  {pin.title}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* 민원 현황 카드 */}
      <div
        className="stats-card-blue"
        onClick={() => onTabChange && onTabChange(isAdmin ? "admin" : "status")}
      >
        <div className="stats-header">
          <span className="stats-title">
            {isAdmin ? "전체 민원 현황" : "내 민원 현황"}
          </span>
          <span className="stats-link">
            {isAdmin ? "관리 →" : "전체보기 →"}
          </span>
        </div>
        <div className="stats-row">
          <span>
            전체{" "}
            <b
              key={isGuest ? dialNum : "real"}
              style={{
                display: "inline-block",
                animation: isGuest ? "fadeSlide 0.3s ease" : "none",
              }}
            >
              {isGuest ? dialNum : isAdmin ? complaints.length : myList.length}
            </b>
            건
          </span>
          <span>
            / 처리중{" "}
            <b
              style={{
                display: "inline-block",
                animation: isGuest ? "fadeSlide 0.3s ease" : "none",
              }}
            >
              {isGuest ? Math.floor(dialNum * 0.14) : processing}
            </b>
            건
          </span>
          <span>
            / 해결완료{" "}
            <b
              style={{
                display: "inline-block",
                animation: isGuest ? "fadeSlide 0.3s ease" : "none",
              }}
            >
              {isGuest ? Math.floor(dialNum * 0.72) : done}
            </b>
            건
          </span>
        </div>
      </div>

      {/* 최근 민원 */}
      <div className="recent-section">
        <div className="recent-header">
          <span className="recent-title">최근 민원</span>
          <span
            style={{
              fontSize: "0.82rem",
              fontWeight: 600,
              color: "#2563EB",
              cursor: "pointer",
            }}
            onClick={() => onTabChange && onTabChange("board")}
          >
            전체보기 →
          </span>
        </div>
        <div
          key={isGuest ? fadeKey : "list"}
          style={{ animation: isGuest ? "fadeSlide 0.4s ease" : "none" }}
        >
          {displayList.map((c) => (
            <div key={c.id} className="recent-row">
              <div className="recent-row-top">
                <span className="recent-row-title">{c.title}</span>
                <span className={`status-pill status-${c.status}`}>
                  {c.status}
                </span>
              </div>
              <div className="recent-row-meta">
                {c.location} &nbsp;{" "}
                {c.created_at ? formatDate(c.created_at) : c.timestamp || ""}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

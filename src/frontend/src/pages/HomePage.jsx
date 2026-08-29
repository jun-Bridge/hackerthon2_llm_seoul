import { useState, useEffect, useRef } from "react";
import { useApp } from "../store/AppContext";
import { formatDate } from "../store/constants";
import "../styles/home.css";

const locationPinPositions = {
  "공학관 3층": { top: "18%", left: "75%" },
  "학생회관 2층": { top: "55%", left: "55%" },
  "중앙도서관 4층": { top: "45%", left: "48%" },
  "본관 정문": { top: "85%", left: "48%" },
  "공학관 5층": { top: "14%", left: "78%" },
};

const statusColors = {
  처리중: "#EF4444",
  해결완료: "#10B981",
  미확인: "#F59E0B",
  보류: "#8B5CF6",
};

export default function HomePage({ onOpenChat, onTabChange }) {
  const { user, complaints } = useApp();
  const isAdmin = user?.role === "admin";
  const myList = complaints.filter((c) => c.is_mine);
  const processing = myList.filter((c) => c.status === "처리중").length;
  const done = myList.filter((c) => c.status === "해결완료").length;

  const [hoveredPinId, setHoveredPinId] = useState(null);

  // 지도 드래그 패닝
  const [mapOffset, setMapOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, startOffX: 0, startOffY: 0 });

  const handleMapPointerDown = (e) => {
    dragRef.current = { dragging: true, startX: e.clientX, startY: e.clientY, startOffX: mapOffset.x, startOffY: mapOffset.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const handleMapPointerMove = (e) => {
    if (!dragRef.current.dragging) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setMapOffset({ x: dragRef.current.startOffX + dx, y: dragRef.current.startOffY + dy });
  };
  const handleMapPointerUp = () => { dragRef.current.dragging = false; };

  // 화면에 뜨는 것은 전부 서버가 준 우리 학교 민원이다. 가짜로 채우지 않는다 —
  // 비어 있으면 "민원이 없다"가 사실이고, 데모를 섞으면 빈 게시판과 장애를 구분할 수 없다.
  const sourceList = complaints;
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
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
        <div className="greeting" style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#0F172A" }}>
            안녕하세요, {user?.email?.split("@")[0] || "학생"}님
          </div>
          {user?.school_name && (
            <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "#94A3B8" }}>
              {user.school_name} 캠퍼스 민원 도우미
            </div>
          )}
        </div>
        <img
          src="/dadumi-face-brave.png"
          alt="다듬이"
          style={{ width: "56px", height: "56px", objectFit: "contain", flexShrink: 0 }}
        />
      </div>

      {!isAdmin && (
        <div className="input-trigger" onClick={onOpenChat}>
          <span>불편한 점을 편하게 적어주세요</span>
          <i
            className="bi bi-arrow-right"
            style={{ color: "#2563EB", fontWeight: 700 }}
          ></i>
        </div>
      )}

      {/* 캠퍼스 지도 */}
      <div
        style={{
          width: "100%",
          height: "200px",
          borderRadius: "14px",
          position: "relative",
          overflow: "hidden",
          border: "1px solid rgba(226, 232, 240, 0.6)",
          cursor: "grab",
          touchAction: "none",
        }}
        onPointerDown={handleMapPointerDown}
        onPointerMove={handleMapPointerMove}
        onPointerUp={handleMapPointerUp}
        onPointerCancel={handleMapPointerUp}
      >
        <div style={{
          position: "absolute", inset: 0,
          transform: `translate(${mapOffset.x}px, ${mapOffset.y}px)`,
          transition: dragRef.current.dragging ? "none" : "transform 0.15s ease-out",
        }}>
          <img
            src="/map.png"
            alt="캠퍼스 지도"
            style={{
              position: "absolute",
              width: "220%",
              height: "220%",
              objectFit: "cover",
              objectPosition: "58% 42%",
              top: "-60%",
              left: "-60%",
              pointerEvents: "none",
              userSelect: "none",
            }}
          />
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
                onClick={(e) => { e.stopPropagation(); onTabChange && onTabChange("board", pin.id); }}
                onPointerDown={(e) => e.stopPropagation()}
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
                    bottom: "calc(100% + 10px)",
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
              key="real"
              style={{
                display: "inline-block",
                animation: "none",
              }}
            >
              {isAdmin ? complaints.length : myList.length}
            </b>
            건
          </span>
          <span>
            / 처리중{" "}
            <b
              style={{
                display: "inline-block",
                animation: "none",
              }}
            >
              {processing}
            </b>
            건
          </span>
          <span>
            / 해결완료{" "}
            <b
              style={{
                display: "inline-block",
                animation: "none",
              }}
            >
              {done}
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
          key="list"
          style={{ animation: "none" }}
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

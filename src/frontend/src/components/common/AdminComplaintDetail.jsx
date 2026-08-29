import { useState } from "react";
import { useToast } from "./Toast";
import PageHeader from "./PageHeader";

const STATUSES = ["확인", "처리중", "해결완료", "보류", "거절"];

// 현재 상태에서 전이 가능한 상태 목록
function getAvailableStatuses(current) {
  switch (current) {
    case "미확인": return ["확인"];
    case "확인": return ["처리중", "보류", "거절"];
    case "처리중": return ["해결완료"];
    case "보류": return ["해결완료"];
    default: return [];
  }
}

// 관리자 전용 민원 상세 페이지
// - 테이블형 정보 (제목/위치/접수일/상태)
// - 코멘트 입력
// - 민원 내용
// - 상태 전이 팝업
export default function AdminComplaintDetail({ complaint, onClose, onStatusChange, onAddComment }) {
  const { showToast } = useToast();
  const [showStatusPopup, setShowStatusPopup] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState(() => {
    const avail = getAvailableStatuses(complaint?.status);
    return avail.length > 0 ? avail[0] : complaint?.status || "확인";
  });
  const [comment, setComment] = useState("");

  if (!complaint) return null;

  const handleChangeStatus = () => {
    onStatusChange?.(complaint.id, selectedStatus, comment);
    setShowStatusPopup(false);
  };

  const handleAddComment = () => {
    if (!comment.trim()) return;
    onAddComment?.(complaint.id, comment.trim());
    setComment("");
  };

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "#FFFFFF",
        zIndex: 250,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* 헤더 */}
      <div
        style={{
          height: "56px",
          padding: "0 16px",
          display: "flex",
          alignItems: "center",
          borderBottom: "1px solid #F1F5F9",
          background: "#FFFFFF",
          flexShrink: 0,
          gap: "8px",
        }}
      >
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            fontSize: "1.2rem",
            color: "#0F172A",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
          }}
        >
          <i className="bi bi-chevron-left"></i>
        </button>
        <span style={{ fontSize: "0.95rem", fontWeight: 800, color: "#0F172A", flex: 1 }}>
          민원 상세 정보
        </span>
        <span className={`status-pill status-${complaint.status}`}>{complaint.status}</span>
        <button
          onClick={() => {
            const avail = getAvailableStatuses(complaint.status);
            if (avail.length === 0) {
              showToast("이 상태에서는 더 이상 변경할 수 없습니다");
              return;
            }
            setShowStatusPopup(true);
          }}
          style={{
            padding: "5px 10px",
            borderRadius: "6px",
            background: getAvailableStatuses(complaint.status).length > 0 ? "#F1F5F9" : "#F8FAFC",
            color: getAvailableStatuses(complaint.status).length > 0 ? "#475569" : "#CBD5E1",
            border: "none",
            fontSize: "0.75rem",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          수정
        </button>
      </div>

      {/* 바디 - 스크롤 가능 */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
        {/* 정보 테이블 */}
        <div style={{ border: "1px solid #E2E8F0", borderRadius: "12px", overflow: "hidden" }}>
          <InfoRow label="제목" value={complaint.title} />
          <InfoRow label="위치" value={complaint.location} />
          <InfoRow label="접수일" value={complaint.timestamp || complaint.created_at} />
          <InfoRow label="상태" value={complaint.status} isStatus />
        </div>

        {/* 코멘트 */}
        <div>
          <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "#0F172A", marginBottom: "8px" }}>코멘트</div>

          {/* 기존 코멘트 목록 */}
          {complaint.comments && complaint.comments.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginBottom: "10px" }}>
              {complaint.comments.map((c) => (
                <div
                  key={c.id}
                  style={{
                    padding: "10px 12px",
                    background: "#F8FAFC",
                    borderRadius: "8px",
                    fontSize: "0.82rem",
                    color: "#334155",
                    lineHeight: 1.5,
                  }}
                >
                  {c.is_hold_reason && <span style={{ color: "#D97706", fontWeight: 700 }}>[보류 사유] </span>}
                  {c.content}
                </div>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: "8px" }}>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="내부 코멘트를 입력하세요"
              style={{
                flex: 1,
                minHeight: "60px",
                padding: "10px 12px",
                border: "1px solid #E2E8F0",
                borderRadius: "10px",
                fontSize: "0.85rem",
                color: "#0F172A",
                resize: "vertical",
                outline: "none",
                background: "#FAFAFA",
              }}
            />
            <button
              onClick={handleAddComment}
              disabled={!comment.trim()}
              style={{
                padding: "0 14px",
                borderRadius: "10px",
                background: comment.trim() ? "#2563EB" : "#CBD5E1",
                color: "#FFF",
                border: "none",
                fontSize: "0.82rem",
                fontWeight: 700,
                cursor: comment.trim() ? "pointer" : "default",
                alignSelf: "flex-end",
                height: "40px",
                transition: "background 0.2s ease",
              }}
            >
              추가
            </button>
          </div>
        </div>

        {/* 민원 내용 */}
        <div style={{ border: "1px solid #E2E8F0", borderRadius: "12px", padding: "16px" }}>
          <div style={{ fontSize: "0.92rem", fontWeight: 800, color: "#0F172A", marginBottom: "10px" }}>민원 내용</div>
          <div style={{ fontSize: "0.86rem", color: "#334155", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
            {complaint.rawText || complaint.body || complaint.summary || complaint.title}
          </div>
        </div>
      </div>

      {/* 상태 전이 팝업 */}
      {showStatusPopup && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.3)",
            zIndex: 300,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
          }}
          onClick={() => setShowStatusPopup(false)}
        >
          <div
            style={{
              background: "#FFFFFF",
              borderRadius: "16px",
              padding: "24px",
              width: "100%",
              maxWidth: "300px",
              boxShadow: "0 12px 32px rgba(0,0,0,0.1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: "1rem", fontWeight: 800, color: "#0F172A", marginBottom: "16px" }}>
              처리 상태 변경
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "20px" }}>
              {getAvailableStatuses(complaint.status).map((s) => (
                <label
                  key={s}
                  style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}
                >
                  <input
                    type="radio"
                    name="status"
                    checked={selectedStatus === s}
                    onChange={() => setSelectedStatus(s)}
                    style={{ width: "18px", height: "18px", accentColor: "#2563EB" }}
                  />
                  <span style={{ fontSize: "0.9rem", fontWeight: 600, color: "#0F172A" }}>{s}</span>
                </label>
              ))}
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                onClick={handleChangeStatus}
                style={{
                  flex: 1,
                  height: "42px",
                  borderRadius: "10px",
                  background: "#2563EB",
                  color: "#FFF",
                  fontSize: "0.88rem",
                  fontWeight: 700,
                  border: "none",
                  cursor: "pointer",
                }}
              >
                변경하기
              </button>
              <button
                onClick={() => setShowStatusPopup(false)}
                style={{
                  flex: 1,
                  height: "42px",
                  borderRadius: "10px",
                  background: "#FFFFFF",
                  color: "#475569",
                  fontSize: "0.88rem",
                  fontWeight: 700,
                  border: "1px solid #E2E8F0",
                  cursor: "pointer",
                }}
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value, isStatus }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "14px 16px",
        borderBottom: "1px solid #F1F5F9",
      }}
    >
      <span style={{ fontSize: "0.84rem", fontWeight: 700, color: "#475569", minWidth: "60px" }}>
        {label}
      </span>
      <span
        style={{
          fontSize: "0.88rem",
          fontWeight: 600,
          color: isStatus ? "#2563EB" : "#0F172A",
          flex: 1,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function ActionBtn({ label, bg, border, color, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "5px 10px",
        borderRadius: "6px",
        background: bg,
        color: color || "#FFF",
        border: border ? `1px solid ${border}` : "none",
        fontSize: "0.72rem",
        fontWeight: 700,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

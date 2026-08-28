import { useApp } from "../../store/AppContext";
import { useToast } from "./Toast";

export default function ComplaintDetail({ complaint, onClose, canWithdraw }) {
  const { deleteComplaint } = useApp();
  const { showToast } = useToast();

  if (!complaint) return null;

  const handleWithdraw = () => {
    if (confirm("이 민원을 철회하시겠습니까?")) {
      try {
        deleteComplaint(complaint.id);
      } catch (e) {}
      showToast("민원이 철회되었습니다.");
      onClose();
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15, 23, 42, 0.18)",
        zIndex: 250,
        display: "flex",
        justifyContent: "center",
        alignItems: "stretch",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "430px",
          height: "100%",
          background: "#FFFFFF",
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
          boxShadow: "0 0 0 1px rgba(226, 232, 240, 0.8)",
        }}
      >
        {/* 헤더 */}
        <div
          style={{
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid #F1F5F9",
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
              flexShrink: 0,
            }}
          >
            <i className="bi bi-arrow-left"></i>
          </button>
          <span
            style={{
              fontWeight: 800,
              fontSize: "0.96rem",
              flex: 1,
              textAlign: "center",
            }}
          >
            민원 상세
          </span>
          <div style={{ width: "20px", flexShrink: 0 }}></div>
        </div>

        {/* 바디 */}
        <div
          style={{
            padding: "16px",
            display: "flex",
            flexDirection: "column",
            gap: "14px",
          }}
        >
          {/* 상태 */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flexWrap: "wrap",
            }}
          >
            <span className={`status-pill status-${complaint.status}`}>
              {complaint.status}
            </span>
            <span
              style={{
                fontSize: "0.7rem",
                fontWeight: 700,
                color: "#2563EB",
                background: "#EFF6FF",
                padding: "4px 8px",
                borderRadius: "9999px",
              }}
            >
              {complaint.category}
            </span>
          </div>

          {/* 제목 */}
          <div
            style={{
              fontSize: "1rem",
              fontWeight: 800,
              color: "#0F172A",
              lineHeight: "1.4",
            }}
          >
            {complaint.title}
          </div>

          {/* 정보 */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              fontSize: "0.84rem",
              border: "1px solid #E2E8F0",
              borderRadius: "14px",
              background: "#F8FAFC",
              padding: "12px 14px",
            }}
          >
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <span
                style={{ color: "#94A3B8", fontWeight: 700, minWidth: "42px" }}
              >
                위치
              </span>
              <span style={{ color: "#0F172A", fontWeight: 500 }}>
                {complaint.location}
              </span>
            </div>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <span
                style={{ color: "#94A3B8", fontWeight: 700, minWidth: "42px" }}
              >
                접수일
              </span>
              <span style={{ color: "#0F172A", fontWeight: 500 }}>
                {complaint.timestamp || complaint.created_at}
              </span>
            </div>
          </div>

          {/* 내용 */}
          <div
            style={{
              border: "1px solid #E2E8F0",
              borderRadius: "14px",
              padding: "14px 16px",
              background: "#FFFFFF",
            }}
          >
            <div
              style={{
                fontSize: "0.82rem",
                fontWeight: 800,
                color: "#0F172A",
                marginBottom: "8px",
              }}
            >
              민원 내용
            </div>
            <div
              style={{
                fontSize: "0.87rem",
                color: "#374151",
                lineHeight: "1.7",
                whiteSpace: "pre-wrap",
              }}
            >
              {complaint.rawText || complaint.summary || complaint.title}
            </div>
          </div>

          {/* 철회 버튼 (본인 민원만) */}
          {canWithdraw && (
            <button
              onClick={handleWithdraw}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "10px",
                background: "#FFFFFF",
                border: "1px solid #FCA5A5",
                color: "#B91C1C",
                fontSize: "0.85rem",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              민원 철회
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { useApp } from "../../store/AppContext";
import { useToast } from "./Toast";

// 상태 전이 규칙 — 백엔드 complaint_repo가 UPDATE...WHERE status=<전제> 로 강제하는 것과
// 같은 표여야 한다. 어긋나면 버튼은 보이는데 서버가 409 INVALID_TRANSITION으로 막는다.
//   미확인 → 확인 : 버튼이 아니라 '상세 열람'(POST open)의 부작용이라 여기 없다
//   해결완료로 들어오는 경로는 처리중과 보류 둘 다
function getAvailableTransitions(status) {
  switch (status) {
    case "확인":
      return ["처리중", "보류", "거절"];
    case "처리중":
      return ["해결완료"];
    case "보류":
      return ["해결완료"];
    default:
      return []; // 미확인·해결완료·거절: 누를 수 있는 전이 없음
  }
}

// 보류·거절은 사유가 필수다. 서버가 빈 사유를 422로 막으므로 화면에서도 먼저 거른다.
const REASON_REQUIRED = ["보류", "거절"];

export default function AdminDetailModal({ complaint, onClose }) {
  const { changeStatus } = useApp();
  const { showToast } = useToast();
  // 백엔드는 comments 배열을 준다(단수 comment 필드는 없다). 보류 사유를 강조해 초기 표시.
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState(null);

  if (!complaint) return null;

  const transitions = getAvailableTransitions(complaint.status);

  const handleAction = async (newStatus) => {
    if (busy) return;
    const reason = comment.trim();
    if (REASON_REQUIRED.includes(newStatus) && !reason) {
      showToast(`${newStatus} 사유를 코멘트에 입력해 주세요.`);
      return;
    }
    setBusy(true);
    try {
      await changeStatus(complaint.id, newStatus, reason);
      showToast(`#${complaint.id} 상태 → ${newStatus}`);
      onClose();
    } catch (e) {
      showToast(e?.message || "상태 변경에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmStatusChange = () => {
    if (selectedStatus) {
      handleAction(selectedStatus);
    }
    setShowStatusModal(false);
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
          margin: "0 auto",
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
            민원 상세 정보
          </span>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: "6px",
              flexShrink: 0,
              flexWrap: "wrap",
              maxWidth: "150px",
            }}
          >
            {complaint.status === "확인" && (
              <>
                <button
                  onClick={() => handleAction("처리중")}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "8px",
                    background: "#2563EB",
                    color: "#fff",
                    border: "none",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  수락
                </button>
                <button
                  onClick={() => handleAction("보류")}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "8px",
                    background: "#fff",
                    color: "#475569",
                    border: "1px solid #E2E8F0",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  보류
                </button>
                <button
                  onClick={() => handleAction("거절")}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "8px",
                    background: "#fff",
                    color: "#B91C1C",
                    border: "1px solid #FCA5A5",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  거절
                </button>
              </>
            )}
            {/* 해결완료로 들어오는 경로는 둘 — 처리중과 보류 (backend §4 전이표) */}
            {(complaint.status === "처리중" || complaint.status === "보류") && (
              <button
                onClick={() => handleAction("해결완료")}
                style={{
                  padding: "6px 12px",
                  borderRadius: "8px",
                  background: "#16A34A",
                  color: "#fff",
                  border: "none",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                해결완료
              </button>
            )}
            {transitions.length > 0 && (
              <button
                onClick={() => {
                  setSelectedStatus(transitions[0]);
                  setShowStatusModal(true);
                }}
                style={{
                  padding: "6px 12px",
                  borderRadius: "8px",
                  background: "#0F172A",
                  color: "#fff",
                  border: "none",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                수정
              </button>
            )}
          </div>
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
          {/* 정보 카드 */}
          <div
            style={{
              border: "1px solid #E2E8F0",
              borderRadius: "14px",
              overflow: "hidden",
              background: "#F8FAFC",
            }}
          >
            {[
              { label: "제목", value: complaint.title },
              { label: "위치", value: complaint.location },
              { label: "접수일", value: complaint.timestamp },
              { label: "상태", value: complaint.status, color: "#2563EB" },
            ].map((row, i) => (
              <div
                key={i}
                style={{
                  padding: "12px 14px",
                  borderBottom: i < 3 ? "1px solid #F1F5F9" : "none",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  background: i % 2 === 1 ? "#FFFFFF" : "#F8FAFC",
                }}
              >
                <span
                  style={{
                    width: "54px",
                    fontSize: "0.78rem",
                    fontWeight: 800,
                    color: "#0F172A",
                    flexShrink: 0,
                  }}
                >
                  {row.label}
                </span>
                <span
                  style={{
                    fontSize: "0.86rem",
                    color: row.color || "#0F172A",
                    fontWeight: row.color ? 700 : 500,
                    lineHeight: 1.4,
                    wordBreak: "break-word",
                  }}
                >
                  {row.value}
                </span>
              </div>
            ))}
          </div>

          {/* 코멘트 */}
          <div>
            <div
              style={{
                fontSize: "0.82rem",
                fontWeight: 800,
                color: "#0F172A",
                marginBottom: "8px",
              }}
            >
              코멘트
            </div>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="내부 코멘트를 입력하세요"
              style={{
                width: "100%",
                minHeight: "88px",
                border: "1px solid #E2E8F0",
                borderRadius: "12px",
                padding: "12px 14px",
                fontSize: "0.85rem",
                resize: "none",
                outline: "none",
                background: "#FAFAFA",
                color: "#0F172A",
                lineHeight: "1.5",
              }}
            />
          </div>

          {/* 민원 내용 */}
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
                fontSize: "0.86rem",
                fontWeight: 800,
                color: "#0F172A",
                marginBottom: "8px",
              }}
            >
              민원 내용
            </div>
            <div
              style={{
                fontSize: "0.86rem",
                color: "#374151",
                lineHeight: "1.7",
                whiteSpace: "pre-wrap",
              }}
            >
              {complaint.rawText || complaint.summary || "-"}
            </div>
          </div>
        </div>

        {/* 상태 변경 모달 */}
        {showStatusModal && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.3)",
              zIndex: 300,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "20px",
            }}
          >
            <div
              style={{
                background: "#FFF",
                borderRadius: "14px",
                padding: "24px",
                maxWidth: "300px",
                width: "100%",
                boxShadow: "0 20px 40px rgba(0,0,0,0.12)",
              }}
            >
              <div
                style={{
                  fontSize: "1rem",
                  fontWeight: 800,
                  textAlign: "center",
                  marginBottom: "16px",
                }}
              >
                처리 상태 변경
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                  marginBottom: "20px",
                }}
              >
                {transitions.map((s) => (
                  <label
                    key={s}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      cursor: "pointer",
                      padding: "6px 0",
                    }}
                  >
                    <input
                      type="radio"
                      name="statusRadio"
                      checked={selectedStatus === s}
                      onChange={() => setSelectedStatus(s)}
                      style={{
                        width: "18px",
                        height: "18px",
                        accentColor: "#2563EB",
                      }}
                    />
                    <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                      {s}
                    </span>
                  </label>
                ))}
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={handleConfirmStatusChange}
                  style={{
                    flex: 1,
                    height: "42px",
                    borderRadius: "10px",
                    background: "#2563EB",
                    color: "#fff",
                    fontSize: "0.88rem",
                    fontWeight: 700,
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  변경하기
                </button>
                <button
                  onClick={() => setShowStatusModal(false)}
                  style={{
                    flex: 1,
                    height: "42px",
                    borderRadius: "10px",
                    background: "#fff",
                    color: "#0F172A",
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
    </div>
  );
}

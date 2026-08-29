import { useState, useEffect } from "react";
import { useApp } from "../../store/AppContext";
import { useToast } from "./Toast";
import PageHeader from "./PageHeader";
import { verifyPassword } from "../../api/auth";
import { getComplaint, getComplaintConversation } from "../../api/board";

export default function ComplaintDetail({ complaint, onClose, canWithdraw }) {
  const { deleteComplaint } = useApp();
  const { showToast } = useToast();

  // 목록 응답의 comments에는 보류 사유만 담겨 온다(계약 0장). 코멘트 전체를 보려면
  // 상세를 따로 받아야 한다.
  const [detail, setDetail] = useState(null);
  const [conversation, setConversation] = useState(null);
  const [showConv, setShowConv] = useState(false);
  const [convLoading, setConvLoading] = useState(false);

  const cid = complaint?.id;
  useEffect(() => {
    if (cid == null) return;
    let alive = true;
    getComplaint(cid)
      .then((d) => alive && setDetail(d))
      .catch(() => {}); // 실패해도 목록 데이터로 계속 보여준다
    return () => {
      alive = false;
    };
  }, [cid]);

  if (!complaint) return null;

  const view = detail || complaint;
  const comments = view.comments || [];

  // 원문 보기 — 학생-AI 대화 전체를 시간순으로. 한 번 받아오면 토글만 한다.
  const toggleConversation = async () => {
    if (conversation) {
      setShowConv((v) => !v);
      return;
    }
    setConvLoading(true);
    try {
      const rows = await getComplaintConversation(cid);
      setConversation(rows || []);
      setShowConv(true);
    } catch (e) {
      showToast(e?.message || "원문을 불러오지 못했습니다.");
    } finally {
      setConvLoading(false);
    }
  };

  // 철회는 되돌릴 수 없어서 정본이 3단계를 요구한다(요구사항 2.11~2.12):
  // ① 경고 + 비밀번호 → ② 비밀번호가 맞아야 최종 확인창 → ③ 실행.
  // 순서를 바꾸면 "정말 삭제?"에 확인한 뒤에야 비밀번호가 틀렸다는 걸 알게 된다.
  const handleWithdraw = async () => {
    const pw = window.prompt(
      "철회하면 게시판과 관리자 목록 양쪽에서 즉시 사라지고 되돌릴 수 없습니다.\n계속하려면 비밀번호를 입력하세요.",
    );
    if (!pw) return;

    try {
      await verifyPassword(pw); // ① 틀리면 여기서 멈춘다 (401 WRONG_PASSWORD)
    } catch (e) {
      showToast(
        e?.code === "WRONG_PASSWORD"
          ? "비밀번호가 일치하지 않습니다."
          : "본인 확인에 실패했습니다.",
      );
      return;
    }

    // ② 최종 확인
    if (!confirm("정말 철회하시겠습니까? 이 동작은 되돌릴 수 없습니다.")) return;

    try {
      await deleteComplaint(complaint.id, pw); // ③ 실행
      showToast("민원이 철회되었습니다.");
      onClose();
    } catch (e) {
      showToast(e?.message || "철회에 실패했습니다.");
    }
  };

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "#FFFFFF",
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
          background: "transparent",
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
        }}
      >
        {/* 헤더 */}
        <PageHeader title="민원 상세" onBack={onClose} />

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
              {view.body || view.rawText || view.summary || view.title}
            </div>
          </div>

          {/* 관리자 코멘트 — 보류 사유는 강조해서 구분한다 */}
          {comments.length > 0 && (
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
                  marginBottom: "10px",
                }}
              >
                관리자 코멘트
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {comments.map((c) => (
                  <div key={c.id} style={{ fontSize: "0.85rem", lineHeight: "1.6" }}>
                    {c.is_hold_reason && (
                      <span style={{ color: "#D97706", fontWeight: 800 }}>[보류 사유] </span>
                    )}
                    <span style={{ color: "#374151" }}>{c.content}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 원문 보기 — 학생-AI 대화 왕복 전체 */}
          <button
            onClick={toggleConversation}
            disabled={convLoading}
            style={{
              width: "100%",
              padding: "11px",
              borderRadius: "10px",
              background: "#F1F5F9",
              border: "none",
              fontSize: "0.84rem",
              fontWeight: 700,
              color: "#475569",
              cursor: convLoading ? "default" : "pointer",
            }}
          >
            {convLoading ? "불러오는 중…" : showConv ? "원문 접기" : "AI와의 대화 원문 보기"}
          </button>

          {showConv && conversation && (
            <div
              style={{
                background: "#F8FAFC",
                border: "1px solid #E2E8F0",
                borderRadius: "14px",
                padding: "14px 16px",
                display: "flex",
                flexDirection: "column",
                gap: "10px",
              }}
            >
              {conversation.length === 0 ? (
                <div style={{ fontSize: "0.84rem", color: "#94A3B8" }}>대화 기록이 없습니다</div>
              ) : (
                conversation.map((t, i) => (
                  <div key={i} style={{ fontSize: "0.84rem", lineHeight: "1.6" }}>
                    <span
                      style={{
                        fontWeight: 800,
                        color: t.role === "student" ? "#0F172A" : "#2563EB",
                      }}
                    >
                      {t.role === "student" ? "학생" : "다듬이"}
                    </span>
                    <span style={{ color: "#374151", whiteSpace: "pre-wrap" }}> {t.content}</span>
                  </div>
                ))
              )}
            </div>
          )}

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

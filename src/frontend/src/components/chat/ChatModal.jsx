import { useState, useRef, useEffect } from "react";
import { useToast } from "../common/Toast";
import SubmitSuccessModal from "./SubmitSuccessModal";
import { createSession, sendMessage, submitSession } from "../../api/session";
import { ApiError } from "../../api/client";

// 선택지(칩)는 서버가 준다 — 모델이 ask_followup으로 낸 것에 서버가 고정 칩을 병합한 결과다.
// 브라우저가 상수로 들고 있으면 서버가 준 choices를 무시하게 되므로 두지 않는다.
// (docs/api-contract.md 8.1-1 "칩과 단계는 특히 조심해야 한다")

const MASCOT_IMAGE = "/cheer.png";

// personaStage에 따른 캐릭터 이미지
const PERSONA_IMAGES = {
  idle: "/cheer.png",
  listening: "/typing.png",
  writing: "/write.png",
  summary: "/cheer.png",
  success: "/heart.png",
};

export default function ChatModal({ onClose }) {
  const { showToast } = useToast();
  const [messages, setMessages] = useState([
    {
      sender: "bot",
      text: "안녕하세요! 저는 다듬이예요.\n어떤 불편이 있으셨나요? 편하게 말씀해 주세요.",
      chips: [],
    },
  ]);
  const [input, setInput] = useState("");
  const [step, setStep] = useState("idle");
  const [chatData, setChatData] = useState({
    category: null,
    location: null,
    detail: null,
  });
  const [stepHistory, setStepHistory] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [showConfirmCard, setShowConfirmCard] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [pendingImage, setPendingImage] = useState(null);
  const [personaStage, setPersonaStage] = useState("idle"); // idle | listening | writing | summary | success
  const [sessionId, setSessionId] = useState(null);
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, 99999);
  }, [messages, isTyping, showConfirmCard]);

  // 세션은 열 때 한 번 만든다. 백엔드 없으면 로컬 모의 모드로 전환 (디자인 확인용).
  useEffect(() => {
    createSession()
      .then((r) => setSessionId(r.session_id))
      .catch(() =>
        addBotMsg("세션을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요."),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addBotMsg = (text, chips = []) => {
    setMessages((prev) => [...prev, { sender: "bot", text, chips }]);
  };

  // 파일 선택 → data URL로 읽어 대기열에 둔다. 리사이즈는 서버가 하므로 원본 그대로.
  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPendingImage(reader.result);
    reader.readAsDataURL(file);
    e.target.value = ""; // 같은 파일 재선택 가능하게
  };

  const handleSend = () => {
    if (!input.trim() && !pendingImage) return;
    send(input.trim(), pendingImage);
  };

  // 칩을 누르는 것도 그냥 메시지를 보내는 것이다 — 선택 전용 API는 없다.
  const handleChipClick = (chipText) => {
    send(chipText, null);
  };

  // 한 턴: 발화를 화면에 얹고 → 서버로 보내고(내부에서 Bedrock 호출) → 응답으로 화면을 가른다.
  // 몇 번 되물을지는 모델이 정한다. 브라우저가 단계를 몰지 않는다.
  const send = async (text, image) => {
    if (isTyping || !sessionId) return;

    setMessages((prev) => [
      ...prev,
      { sender: "user", text: text || "", chips: [], image: image || null },
    ]);
    setInput("");
    setPendingImage(null);
    setShowConfirmCard(false);
    setPersonaStage("listening");
    setIsTyping(true);

    try {
      const r = await sendMessage(sessionId, text, image ? { data: image } : null);
      setPersonaStage("writing");

      if (r.is_complete) {
        const p = r.preview || {};
        // 확정안을 요약 카드가 읽는 형태로 옮긴다 (카드는 category/location/detail을 읽는다)
        setChatData({
          category: p.category || null,
          location: p.location || null,
          detail: p.refined_title || p.refined_body || null,
        });
        setStep("confirm");
        setStepHistory((h) => [...h, step]);
        setShowConfirmCard(true);
        setPersonaStage("summary");
      } else {
        setStep(r.step || "idle");
        setStepHistory((h) => [...h, step]);
        addBotMsg(r.question || "조금 더 자세히 알려주세요.", r.choices || []);
        setPersonaStage("idle");
      }
    } catch (err) {
      const code = err instanceof ApiError ? err.code : null;
      if (code === "CONVERSATION_STUCK") {
        addBotMsg("대화가 제자리를 맴돌고 있어요. 처음부터 다시 말씀해 주시겠어요?");
      } else if (code === "BEDROCK_ERROR") {
        addBotMsg("AI 응답에 실패했어요. 잠시 후 다시 보내주세요. (쓰신 내용은 저장돼 있어요)");
      } else {
        addBotMsg(err?.message || "요청을 처리하지 못했어요.");
      }
      setPersonaStage("idle");
    } finally {
      setIsTyping(false);
    }
  };

  // 정식 접수 — 서버가 보관 중인 마지막 확정안으로 민원을 만든다.
  // 확정안을 본문에 실어 보내지 않는다: 화면에서 값을 바꿔 보낼 수 있게 되기 때문이다.
  const handleSubmit = async () => {
    if (!sessionId || isTyping) return;
    if (!confirm("이대로 접수하시겠습니까? 접수 후에는 수정할 수 없습니다.")) return;

    setIsTyping(true);
    try {
      const r = await submitSession(sessionId); // { complaint_id, next_session_id }
      setStep("done");
      setPersonaStage("success");
      setShowConfirmCard(false);
      setShowSuccessModal(true);
      showToast(`민원 #${r.complaint_id} 접수 완료!`);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : null;
      if (code === "DRAFT_NOT_COMPLETE") {
        addBotMsg("아직 확정안이 없어요. 위치와 상황을 조금 더 알려주세요.");
      } else {
        addBotMsg(err?.message || "접수에 실패했어요.");
      }
      setShowConfirmCard(false);
    } finally {
      setIsTyping(false);
    }
  };

  // 되돌아가기 — 별도 API가 없다. 고치고 싶다는 말을 그대로 보내면 모델이 다시 되묻는다.
  // 수정 전용 경로를 만들면 대화 기록과 실제 상태가 갈라진다.
  const handleGoBack = () => {
    setShowConfirmCard(false);
    setStepHistory((h) => h.slice(0, -1));
    send("방금 정리한 내용을 고치고 싶어요.", null);
  };

  // 처음부터 — 새 세션을 발급받는다. 이전 대화와 섞이지 않게.
  const handleReset = async () => {
    setStep("idle");
    setChatData({ category: null, location: null, detail: null });
    setStepHistory([]);
    setShowConfirmCard(false);
    setPersonaStage("idle");
    setMessages([
      {
        sender: "bot",
        text: "대화가 초기화되었습니다.\n어떤 불편이 있으셨나요?",
        chips: [],
      },
    ]);
    try {
      const r = await createSession();
      setSessionId(r.session_id);
    } catch {
      addBotMsg("새 대화를 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  };

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background:
          "linear-gradient(180deg, #BFDBFE 0%, #DBEAFE 15%, #EFF6FF 32%, #F8FAFC 52%, #FFFFFF 100%)",
        zIndex: 200,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          height: "56px",
          padding: "0 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "transparent",
          flexShrink: 0,
          position: "relative",
        }}
      >
        <button
          onClick={() => onClose(false)}
          aria-label="뒤로 가기"
          style={{
            position: "absolute",
            left: "16px",
            background: "none",
            border: "none",
            color: "#0F172A",
            fontSize: "1.2rem",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
          }}
        >
          <i className="bi bi-chevron-left"></i>
        </button>

        <span style={{ fontSize: "1rem", fontWeight: 800, color: "#0F172A" }}>
          새 민원 접수
        </span>

        <button
          onClick={handleReset}
          aria-label="초기화"
          style={{
            position: "absolute",
            right: "16px",
            background: "none",
            border: "none",
            color: "#64748B",
            fontSize: "0.82rem",
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          <i className="bi bi-arrow-clockwise"></i>
          초기화
        </button>
      </div>

      {/* 메시지 */}
      <div
        ref={scrollRef}
        className="chat-scroll-area"
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "8px 16px 16px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          background: "transparent",
        }}
      >
        {messages.map((m, i) => {
          // 마지막 봇 메시지인지 확인
          const isLastBot = m.sender === "bot" && !messages.slice(i + 1).some(msg => msg.sender === "bot");
          return (
          <div key={i}>
            {m.sender === "bot" ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: "4px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  {isLastBot && (
                    <img
                      src={PERSONA_IMAGES[personaStage] || MASCOT_IMAGE}
                      alt="다듬이"
                      style={{ width: "32px", height: "32px", objectFit: "contain", transition: "all 0.3s ease" }}
                    />
                  )}
                  <span style={{ fontSize: "0.72rem", fontWeight: 600, color: "#64748B" }}>다듬이</span>
                </div>
                <div
                  style={{
                    maxWidth: "80%",
                    padding: "10px 14px",
                    borderRadius: "14px",
                    background: "#FFFFFF",
                    color: "#0F172A",
                    border: "1px solid #E2E8F0",
                    borderTopLeftRadius: "4px",
                    fontSize: "0.88rem",
                    lineHeight: "1.55",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {m.image && (
                    <img
                      src={m.image}
                      alt="첨부"
                      style={{
                        width: "100%",
                        maxWidth: "180px",
                        borderRadius: "12px",
                        marginBottom: m.text ? "6px" : "0",
                      }}
                    />
                  )}
                  {m.text}
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                }}
              >
                <div
                  style={{
                    maxWidth: "75%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                    gap: "6px",
                  }}
                >
                  {m.image && (
                    <img
                      src={m.image}
                      alt="첨부"
                      style={{
                        width: "100%",
                        maxWidth: "180px",
                        borderRadius: "12px",
                        display: "block",
                      }}
                    />
                  )}
                  {m.text && (
                    <div
                      style={{
                        padding: "10px 14px",
                        borderRadius: "14px",
                        background: "#2563EB",
                        color: "#FFF",
                        borderTopRightRadius: "4px",
                        fontSize: "0.88rem",
                        lineHeight: "1.55",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {m.text}
                    </div>
                  )}
                </div>
              </div>
            )}
            {m.sender === "bot" && m.chips && m.chips.length > 0 && (
              <div
                className="chip-row"
                style={{ marginTop: "6px" }}
              >
                {m.chips.map((c, j) => (
                  <button
                    key={j}
                    className="quick-chip"
                    onClick={() => handleChipClick(c)}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>
        )})}

        {/* 타이핑 */}
        {isTyping && (
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <img
              src={PERSONA_IMAGES["writing"]}
              alt="다듬이"
              style={{ width: "32px", height: "32px", objectFit: "contain" }}
            />
            <div
              style={{
                padding: "10px 14px",
                borderRadius: "14px",
                background: "#FFF",
                border: "1px solid #E2E8F0",
                fontSize: "0.82rem",
                color: "#64748B",
                fontWeight: 600,
              }}
            >
              다듬이가 작성하는 중…
            </div>
          </div>
        )}

        {/* 요약 카드 */}
        {showConfirmCard && (
          <div
            style={{
              width: "100%",
              padding: "16px",
              borderRadius: "16px",
              background: "#FFFFFF",
              border: "1px solid #E2E8F0",
              boxShadow: "0 4px 12px rgba(0,0,0,0.04)",
            }}
          >
            <div style={{ fontSize: "0.92rem", fontWeight: 800, color: "#0F172A", marginBottom: "14px" }}>
              민원 내용 요약
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <i className="bi bi-thermometer-half" style={{ color: "#2563EB", fontSize: "0.9rem" }}></i>
                  <span style={{ fontSize: "0.8rem", color: "#64748B", fontWeight: 600 }}>카테고리</span>
                </div>
                <span style={{ fontSize: "0.84rem", color: "#2563EB", fontWeight: 700 }}>{chatData.category || "미입력"}</span>
              </div>

              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <i className="bi bi-geo-alt-fill" style={{ color: "#2563EB", fontSize: "0.9rem" }}></i>
                  <span style={{ fontSize: "0.8rem", color: "#64748B", fontWeight: 600 }}>위치</span>
                </div>
                <span style={{ fontSize: "0.84rem", color: "#0F172A", fontWeight: 600 }}>{chatData.location || "미입력"}</span>
              </div>

              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
                  <i className="bi bi-file-earmark-text-fill" style={{ color: "#2563EB", fontSize: "0.9rem" }}></i>
                  <span style={{ fontSize: "0.8rem", color: "#64748B", fontWeight: 600 }}>내용 요약</span>
                </div>
                <span style={{ fontSize: "0.84rem", color: "#0F172A", fontWeight: 500, lineHeight: 1.5, textAlign: "right" }}>{chatData.detail || "미입력"}</span>
              </div>
            </div>

            <button
              onClick={handleSubmit}
              style={{
                width: "100%",
                height: "40px",
                marginTop: "14px",
                borderRadius: "10px",
                background: "#4F6EF7",
                color: "#FFF",
                fontSize: "0.88rem",
                fontWeight: 700,
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "4px",
              }}
            >
              민원 접수하기 →
            </button>
          </div>
        )}

      </div>

      {/* 첨부 대기 중인 사진 미리보기 */}
      {pendingImage && (
        <div
          style={{
            padding: "8px 16px",
            borderTop: "1px solid #F1F5F9",
            background: "#F8FAFC",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <img
            src={pendingImage}
            alt="첨부"
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "8px",
              objectFit: "cover",
              border: "1px solid #E2E8F0",
            }}
          />
          <span style={{ fontSize: "0.78rem", color: "#64748B" }}>
            사진 1장 첨부됨
          </span>
          <button
            onClick={() => setPendingImage(null)}
            style={{
              marginLeft: "auto",
              background: "none",
              border: "none",
              color: "#94A3B8",
              fontSize: "1rem",
              cursor: "pointer",
            }}
          >
            <i className="bi bi-x"></i>
          </button>
        </div>
      )}

      {/* 입력 */}
      <div
        style={{
          padding: "10px 16px",
          borderTop: "1px solid #F1F5F9",
          display: "flex",
          gap: "8px",
          alignItems: "center",
          background: "#FFF",
          flexShrink: 0,
        }}
      >
        {/* + 버튼 (이미지 첨부) */}
        <button
          onClick={() => fileInputRef.current?.click()}
          style={{
            width: "38px",
            height: "38px",
            borderRadius: "50%",
            background: "#F1F5F9",
            color: "#64748B",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "1.1rem",
            flexShrink: 0,
          }}
        >
          <i className="bi bi-plus-lg"></i>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={handleImageSelect}
        />
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            background: "#F1F5F9",
            borderRadius: "9999px",
            padding: "0 14px",
            height: "42px",
          }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="메시지를 입력하세요"
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: "0.85rem",
              color: "#0F172A",
            }}
          />
        </div>
        <button
          onClick={handleSend}
          style={{
            width: "38px",
            height: "38px",
            borderRadius: "50%",
            background: (!input.trim() && !pendingImage) ? "#CBD5E1" : "#2563EB",
            color: "#fff",
            border: "none",
            cursor: (!input.trim() && !pendingImage) ? "default" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "1rem",
            flexShrink: 0,
            transition: "background 0.2s ease",
          }}
        >
          <i className="bi bi-send-fill"></i>
        </button>
      </div>

      {/* 접수 완료 모달 */}
      {showSuccessModal && (
        <SubmitSuccessModal
          onConfirm={() => {
            setShowSuccessModal(false);
            onClose(true);
          }}
          onGoStatus={() => {
            setShowSuccessModal(false);
            onClose("status");
          }}
        />
      )}
    </div>
  );
}

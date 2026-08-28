import { useState, useRef, useEffect } from "react";
import { useApp } from "../../store/AppContext";
import { useToast } from "../common/Toast";
import SubmitSuccessModal from "./SubmitSuccessModal";

// 카테고리별 퀵칩
const locationChips = [
  "강의실",
  "실습실",
  "화장실",
  "도서관 열람실",
  "복도/계단",
];
const detailChips = {
  "냉난방 / 설비": ["소음이 심해요", "바람이 안 나와요", "너무 춥거나 더워요"],
  "배관 / 위생": ["물이 새요", "온수가 안 나와요", "막혀있어요"],
  "기자재 / 영상": ["화면이 안 나와요", "소리가 안 나와요", "전원이 안 켜져요"],
  "전기 / 설비": [
    "전기가 안 들어와요",
    "전등이 깜빡거려요",
    "콘센트가 안 돼요",
  ],
  "공간 / 편의": [
    "짐만 두고 자리 비워요",
    "너무 시끄러워요",
    "청결이 불량해요",
  ],
};

const MASCOT_IMAGE = "/cheer.png";

export default function ChatModal({ onClose }) {
  const { addComplaint, complaints } = useApp();
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
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, 99999);
  }, [messages, isTyping, showConfirmCard]);

  const guessCategory = (text) => {
    if (/에어컨|히터|냉방|난방|춥|더워/.test(text)) return "냉난방 / 설비";
    if (/화장실|세면대|물|변기|누수|온수/.test(text)) return "배관 / 위생";
    if (/프로젝터|빔|마이크|화면/.test(text)) return "기자재 / 영상";
    if (/콘센트|전기|충전|조명|깜빡/.test(text)) return "전기 / 설비";
    if (/열람실|자리|좌석|도서관/.test(text)) return "공간 / 편의";
    return "시설 / 환경";
  };

  const addBotMsg = (text, chips = []) => {
    setIsTyping(true);
    setPersonaStage("writing");
    setTimeout(() => {
      setIsTyping(false);
      setPersonaStage("idle");
      setMessages((prev) => [...prev, { sender: "bot", text, chips }]);
    }, 500);
  };

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
    const text = input.trim();
    setPersonaStage("listening");
    const msg = {
      sender: "user",
      text: text || "(사진 첨부)",
      chips: [],
      image: pendingImage || null,
    };
    setMessages((prev) => [...prev, msg]);
    setInput("");
    setPendingImage(null);
    processStep(text);
  };

  const handleChipClick = (chipText) => {
    setMessages((prev) => [
      ...prev,
      { sender: "user", text: chipText, chips: [] },
    ]);
    processStep(chipText);
  };

  const processStep = (text) => {
    if (step === "idle") {
      const hasLoc = /관|층|호|도서관|화장실|실습실|열람실/.test(text);
      const hasIssue =
        /고장|새요|소음|소리|안 나|꺼져|깜빡|춥|더워|물이|안 돼|막힘/.test(
          text,
        );
      const cat = guessCategory(text);

      if (hasLoc && hasIssue) {
        setChatData({ category: cat, location: text, detail: text });
        setStepHistory((prev) => [...prev, "idle"]);
        setStep("confirm");
        setTimeout(() => {
          setShowConfirmCard(true);
          setPersonaStage("summary");
        }, 300);
      } else if (hasLoc) {
        setChatData((prev) => ({ ...prev, location: text, category: cat }));
        setStepHistory((prev) => [...prev, "idle"]);
        setStep("detail");
        const chips = detailChips[cat] || ["고장났어요", "파손됐어요"];
        addBotMsg(`${text}, 확인했습니다.\n어떤 문제가 발생했나요?`, chips);
      } else {
        setChatData((prev) => ({ ...prev, detail: text, category: cat }));
        setStepHistory((prev) => [...prev, "idle"]);
        setStep("location");
        addBotMsg(
          `불편하셨겠어요. 해당 문제가 어느 건물·공간에서 발생했나요?`,
          locationChips,
        );
      }
    } else if (step === "location") {
      setChatData((prev) => ({ ...prev, location: text }));
      setStepHistory((prev) => [...prev, "location"]);
      setStep("confirm");
      setTimeout(() => setShowConfirmCard(true), 300);
    } else if (step === "detail") {
      setChatData((prev) => ({ ...prev, detail: text }));
      setStepHistory((prev) => [...prev, "detail"]);
      setStep("confirm");
      setTimeout(() => setShowConfirmCard(true), 300);
    }
  };

  const handleSubmit = () => {
    const newId =
      complaints.length > 0
        ? Math.max(...complaints.map((c) => c.id)) + 1
        : 301;
    // 로컬에서도 동작하도록 try-catch
    try {
      addComplaint({
        id: newId,
        category: chatData.category || "시설 / 환경",
        location: chatData.location || "교내",
        rawText: chatData.detail || "",
        title: `${chatData.location || "교내"} 시설 점검 요청`,
        summary: chatData.detail || "",
        timestamp: new Date().toLocaleDateString("ko-KR"),
        status: "미확인",
        isMine: true,
        is_mine: true,
      });
    } catch (e) {
      /* 로컬 fallback */
    }
    setStep("done");
    setPersonaStage("success");
    setShowConfirmCard(false);
    setShowSuccessModal(true);
    showToast(`민원 #${newId} 접수 완료!`);
  };

  const handleGoBack = () => {
    const prev = stepHistory[stepHistory.length - 1];
    setStepHistory((h) => h.slice(0, -1));
    setShowConfirmCard(false);

    if (prev === "detail" || step === "confirm") {
      setChatData((d) => ({ ...d, detail: null }));
      setStep("detail");
      const chips = detailChips[chatData.category] || [
        "고장났어요",
        "파손됐어요",
      ];
      addBotMsg(
        `${chatData.location}에서 어떤 문제가 발생했나요? 다시 선택해 주세요.`,
        chips,
      );
    } else if (prev === "location") {
      setChatData((d) => ({ ...d, location: null }));
      setStep("location");
      addBotMsg("위치를 다시 입력해 주세요.", locationChips);
    } else {
      setStep("idle");
      setChatData({ category: null, location: null, detail: null });
      addBotMsg("처음부터 다시 말씀해 주세요.");
    }
  };

  const handleReset = () => {
    setStep("idle");
    setChatData({ category: null, location: null, detail: null });
    setStepHistory([]);
    setShowConfirmCard(false);
    setMessages([
      {
        sender: "bot",
        text: "대화가 초기화되었습니다.\n어떤 불편이 있으셨나요?",
        chips: [],
      },
    ]);
  };

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "#FFF",
        zIndex: 200,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          flexShrink: 0,
          background:
            "linear-gradient(180deg, rgba(226,233,255,0.96) 0%, rgba(234,239,255,0.94) 25%, rgba(245,247,252,0.96) 100%)",
          borderBottom: "1px solid rgba(148, 163, 184, 0.22)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 18px 12px",
          }}
        >
          <button
            onClick={() => onClose(false)}
            aria-label="뒤로 가기"
            style={{
              background: "transparent",
              border: "none",
              color: "#0F172A",
              fontSize: "2rem",
              lineHeight: 1,
              cursor: "pointer",
              padding: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "30px",
              height: "30px",
            }}
          >
            ‹
          </button>

          <div
            style={{
              fontSize: "1.1rem",
              fontWeight: 700,
              color: "#0F172A",
              letterSpacing: "-0.03em",
            }}
          >
            새 민원 접수
          </div>

          <button
            onClick={handleReset}
            style={{
              border: "1px solid rgba(148, 163, 184, 0.35)",
              background: "rgba(255,255,255,0.48)",
              color: "#0F172A",
              borderRadius: "999px",
              height: "34px",
              padding: "0 14px",
              fontSize: "0.92rem",
              fontWeight: 600,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
            }}
          >
            <span style={{ fontSize: "0.88rem" }}>⟳</span>
            초기화
          </button>
        </div>
      </div>

      {/* 메시지 */}
      <div
        ref={scrollRef}
        className="chat-scroll-area"
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          background:
            "linear-gradient(180deg, #BFDBFE 0%, #DBEAFE 15%, #EFF6FF 32%, #F8FAFC 52%, #FFFFFF 100%)",
        }}
      >
        {messages.map((m, i) => (
          <div key={i}>
            {m.sender === "bot" ? (
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-start",
                  gap: "8px",
                  alignItems: "flex-end",
                }}
              >
                <div
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "50%",
                    background:
                      "linear-gradient(180deg, #EFF6FF 0%, #DBEAFE 100%)",
                    border: "1px solid rgba(147, 197, 253, 0.7)",
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    boxShadow: "0 8px 18px rgba(37, 99, 235, 0.12)",
                  }}
                >
                  <img
                    src={MASCOT_IMAGE}
                    alt="다듬이"
                    style={{
                      width: "18px",
                      height: "18px",
                      objectFit: "contain",
                    }}
                  />
                </div>
                <div
                  style={{
                    maxWidth: "75%",
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
                        borderRadius: "8px",
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
                  {m.image && (
                    <img
                      src={m.image}
                      alt="첨부"
                      style={{
                        width: "100%",
                        maxWidth: "180px",
                        borderRadius: "8px",
                        marginBottom: m.text ? "6px" : "0",
                      }}
                    />
                  )}
                  {m.text}
                </div>
              </div>
            )}
            {m.sender === "bot" && m.chips && m.chips.length > 0 && (
              <div
                className="chip-row"
                style={{ marginTop: "6px", marginLeft: "36px" }}
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
        ))}

        {/* 타이핑 */}
        {isTyping && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div
              style={{
                padding: "10px 14px",
                borderRadius: "14px",
                background: "#FFF",
                border: "1px solid #E2E8F0",
              }}
            >
              <div className="typing-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}

        {/* 요약 확인 문구를 채팅 말풍선으로 붙여서 나오게 */}
        {showConfirmCard && (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-start",
              gap: "8px",
              alignItems: "flex-end",
            }}
          >
            <div
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "50%",
                background: "linear-gradient(180deg, #EFF6FF 0%, #DBEAFE 100%)",
                border: "1px solid rgba(147, 197, 253, 0.7)",
                overflow: "hidden",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <img
                src={MASCOT_IMAGE}
                alt="다듬이"
                style={{ width: "18px", height: "18px", objectFit: "contain" }}
              />
            </div>
            <div
              style={{
                maxWidth: "82%",
                padding: "12px 14px",
                borderRadius: "14px",
                background: "#FFFFFF",
                border: "1px solid #E2E8F0",
                borderTopLeftRadius: "4px",
                fontSize: "0.86rem",
                lineHeight: "1.65",
                color: "#0F172A",
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: "8px" }}>
                네, 내용을 정리했어요. 아래 내용으로 접수할까요?
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "4px",
                  color: "#475569",
                }}
              >
                <div>• 카테고리: {chatData.category || "미입력"}</div>
                <div>• 위치: {chatData.location || "미입력"}</div>
                <div>• 내용: {chatData.detail || "미입력"}</div>
              </div>
              <div style={{ display: "flex", gap: "8px", marginTop: "10px" }}>
                <button
                  onClick={handleSubmit}
                  style={{
                    flex: 1,
                    height: "36px",
                    borderRadius: "10px",
                    background: "#2563EB",
                    color: "#FFF",
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  접수하기
                </button>
                <button
                  onClick={handleGoBack}
                  style={{
                    flex: 1,
                    height: "36px",
                    borderRadius: "10px",
                    background: "#F8FAFC",
                    color: "#475569",
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    border: "1px solid #E2E8F0",
                    cursor: "pointer",
                  }}
                >
                  수정하기
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 이미지 미리보기 */}
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
            background: "#2563EB",
            color: "#fff",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "1rem",
            flexShrink: 0,
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
        />
      )}
    </div>
  );
}

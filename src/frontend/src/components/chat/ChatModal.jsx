<<<<<<< HEAD
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
=======
import { useState, useRef, useEffect } from 'react';
import { createSession, sendMessage, submitSession } from '../../api/session';
import { ApiError } from '../../api/client';

// 실제 백엔드 대화 세션과 연동된 챗봇.
// 흐름: createSession → sendMessage(Bedrock) 반복 → is_complete면 preview → 확인창 → submitSession
export default function ChatModal({ onClose, initialCategory = null }) {
  const [messages, setMessages] = useState([
    initialCategory
      ? { sender: 'bot', text: `'${initialCategory}' 관련 불편이시군요.\n어디서 어떤 문제가 있었는지 편하게 말씀해 주세요.` }
      : { sender: 'bot', text: '안녕하세요! 다듬이 AI에요.\n어떤 불편이 있으셨나요? 편하게 말씀해 주세요.' },
  ]);
  const [input, setInput] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [choices, setChoices] = useState(null);   // 현재 되묻기 선택지(칩)
  const [preview, setPreview] = useState(null);    // 확정안(있으면 접수 버튼 노출)
  const [busy, setBusy] = useState(false);         // 턴 진행 중 입력 잠금
  const [pendingImage, setPendingImage] = useState(null);  // 첨부 대기 중인 사진(data URL)
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => { scrollRef.current?.scrollTo(0, 99999); }, [messages]);

  // 세션은 처음 열 때 한 번 생성.
  // 카테고리 프리셋은 안내 문구로만 힌트를 준다(위 초기 메시지). 자동 발화는 하지 않는다
  // — 안내 + 자동전송이 이중으로 뜨면 지저분하므로, 사용자가 직접 첫 메시지를 치게 한다.
  useEffect(() => {
    createSession()
      .then((r) => setSessionId(r.session_id))
      .catch(() => addBot('세션을 시작하지 못했습니다. 다시 시도해 주세요.'));
    // eslint-disable-next-line
  }, []);

  const addBot = (text, extra = {}) => setMessages(prev => [...prev, { sender: 'bot', text, ...extra }]);
  const addUser = (text, image = null) => setMessages(prev => [...prev, { sender: 'user', text, image }]);
>>>>>>> 48e58d9597a200c22373ae87f3c87fdb954fbaee

  // 파일 선택 → data URL로 읽어 대기열에 둔다. 리사이즈는 서버가 하므로 원본 그대로.
  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPendingImage(reader.result);
    reader.readAsDataURL(file);
<<<<<<< HEAD
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
=======
    e.target.value = '';   // 같은 파일을 다시 고를 수 있게
  };

  const doSend = async (text, sidOverride = null) => {
    const sid = sidOverride || sessionId;
    const img = pendingImage;
    // 사진만 보내는 것도 허용한다 (백엔드 message 기본값 "")
    if ((!text.trim() && !img) || busy || !sid) return;
    addUser(text || '(사진 첨부)', img);
    setInput('');
    setPendingImage(null);
    setChoices(null);
    setBusy(true);
    try {
      const r = await sendMessage(sid, text, img ? { data: img } : null);   // ← 실제 Bedrock 호출
      if (r.is_complete) {
        setPreview(r.preview);
        const p = r.preview || {};
        addBot(
          `내용을 정리했어요.\n\n[카테고리] ${p.category}\n[위치] ${p.location}\n[제목] ${p.refined_title}\n\n${p.refined_body}\n\n아래 "정식 접수" 버튼으로 접수하거나, 고칠 점을 더 말씀해 주세요.`,
        );
      } else {
        setPreview(null);
        addBot(r.question || '조금 더 자세히 알려주세요.');
        if (Array.isArray(r.choices) && r.choices.length) setChoices(r.choices);
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'CONVERSATION_STUCK') {
        addBot('대화가 막혔어요. 처음부터 다시 작성하거나 직접 채워 주세요.');
      } else if (err instanceof ApiError && err.code === 'BEDROCK_ERROR') {
        addBot('AI 응답에 실패했어요. 잠시 후 다시 보내주세요. (대화는 저장돼 있어요)');
      } else if (err instanceof ApiError) {
        addBot(err.message || '요청을 처리하지 못했어요.');
      } else {
        addBot('서버에 연결하지 못했어요.');
      }
    } finally {
      setBusy(false);
    }
  };

  // 정식 접수: 확인창 → submitSession
  const handleSubmit = async () => {
    if (!sessionId || busy) return;
    if (!window.confirm('이대로 접수하시겠습니까? 접수 후에는 수정할 수 없습니다.')) return;
    setBusy(true);
    try {
      const r = await submitSession(sessionId);   // { complaint_id, next_session_id }
      addBot(`민원 #${r.complaint_id}이 접수되었습니다!\n게시판과 현황에서 확인하세요.`);
      setPreview(null);
      setChoices(null);
      // 목록 갱신을 MainPage에 알리며 닫기
      setTimeout(() => onClose(true), 900);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'DRAFT_NOT_COMPLETE') {
        addBot('아직 확정안이 없어요. 위치·상황을 마저 알려주세요.');
      } else if (err instanceof ApiError) {
        addBot(err.message || '접수에 실패했어요.');
      } else {
        addBot('서버에 연결하지 못했어요.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#FFF', zIndex: 200, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', flexShrink: 0 }}>
        <button onClick={() => onClose(false)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#0F172A' }}><i className="bi bi-arrow-left"></i></button>
        <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>새 민원 접수</span>
        <div style={{ width: '24px' }}></div>
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px', background: '#F8FAFC' }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: m.sender === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{ maxWidth: '80%', padding: '10px 14px', borderRadius: '14px', background: m.sender === 'user' ? '#2563EB' : '#FFF', color: m.sender === 'user' ? '#FFF' : '#0F172A', border: m.sender === 'bot' ? '1px solid #E2E8F0' : 'none', fontSize: '0.88rem', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
              {m.image && <img src={m.image} alt="첨부" style={{ width: '100%', maxWidth: '180px', borderRadius: '8px', marginBottom: m.text ? '6px' : 0, display: 'block' }} />}
              {m.text}
            </div>
          </div>
        ))}

        {/* 되묻기 선택지(칩) — 누르면 그 문구를 그대로 전송 */}
        {choices && !busy && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '4px' }}>
            {choices.map((c, i) => (
              <button key={i} onClick={() => doSend(c)} style={{ padding: '7px 12px', borderRadius: '9999px', border: '1px solid #BFDBFE', background: '#EFF6FF', color: '#2563EB', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' }}>{c}</button>
            ))}
          </div>
        )}

        {/* 확정안이 있으면 정식 접수 버튼 */}
        {preview && !busy && (
          <button onClick={handleSubmit} style={{ marginTop: '6px', padding: '12px', borderRadius: '12px', background: '#2563EB', color: '#FFF', border: 'none', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer' }}>
            정식 접수
          </button>
>>>>>>> 48e58d9597a200c22373ae87f3c87fdb954fbaee
        )}

        {busy && <div style={{ alignSelf: 'flex-start', color: '#94A3B8', fontSize: '0.82rem' }}>AI가 작성 중…</div>}
      </div>

      {/* 첨부 대기 중인 사진 미리보기 */}
      {pendingImage && (
<<<<<<< HEAD
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
=======
        <div style={{ padding: '8px 16px 0', display: 'flex', alignItems: 'center', gap: '8px', background: '#FFF', flexShrink: 0 }}>
          <img src={pendingImage} alt="첨부 예정" style={{ width: '56px', height: '56px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #E2E8F0' }} />
          <button onClick={() => setPendingImage(null)} style={{ background: 'none', border: 'none', color: '#94A3B8', fontSize: '0.8rem', cursor: 'pointer' }}>첨부 취소</button>
        </div>
      )}

      <div style={{ padding: '10px 16px', borderTop: '1px solid #F1F5F9', display: 'flex', gap: '8px', alignItems: 'center', background: '#FFF', flexShrink: 0 }}>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelect} style={{ display: 'none' }} />
        <button onClick={() => fileInputRef.current?.click()} disabled={busy} title="사진 첨부"
          style={{ width: '38px', height: '38px', borderRadius: '50%', background: '#F1F5F9', color: '#475569', border: 'none', cursor: busy ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0 }}>
          <i className="bi bi-plus-lg"></i>
        </button>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: '#F1F5F9', borderRadius: '9999px', padding: '0 14px', height: '42px' }}>
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doSend(input)} placeholder={busy ? '응답을 기다리는 중…' : '메시지를 입력하세요'} disabled={busy} style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: '0.85rem', color: '#0F172A' }} />
        </div>
        <button onClick={() => doSend(input)} disabled={busy} style={{ width: '38px', height: '38px', borderRadius: '50%', background: busy ? '#93C5FD' : '#2563EB', color: '#fff', border: 'none', cursor: busy ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', flexShrink: 0 }}><i className="bi bi-send-fill"></i></button>
      </div>
>>>>>>> 48e58d9597a200c22373ae87f3c87fdb954fbaee
    </div>
  );
}

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
  const scrollRef = useRef(null);

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
  const addUser = (text) => setMessages(prev => [...prev, { sender: 'user', text }]);

  const doSend = async (text, sidOverride = null) => {
    const sid = sidOverride || sessionId;
    if (!text.trim() || busy || !sid) return;
    addUser(text);
    setInput('');
    setChoices(null);
    setBusy(true);
    try {
      const r = await sendMessage(sid, text);   // ← 실제 Bedrock 호출
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
        )}

        {busy && <div style={{ alignSelf: 'flex-start', color: '#94A3B8', fontSize: '0.82rem' }}>AI가 작성 중…</div>}
      </div>

      <div style={{ padding: '10px 16px', borderTop: '1px solid #F1F5F9', display: 'flex', gap: '8px', alignItems: 'center', background: '#FFF', flexShrink: 0 }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: '#F1F5F9', borderRadius: '9999px', padding: '0 14px', height: '42px' }}>
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doSend(input)} placeholder={busy ? '응답을 기다리는 중…' : '메시지를 입력하세요'} disabled={busy} style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: '0.85rem', color: '#0F172A' }} />
        </div>
        <button onClick={() => doSend(input)} disabled={busy} style={{ width: '38px', height: '38px', borderRadius: '50%', background: busy ? '#93C5FD' : '#2563EB', color: '#fff', border: 'none', cursor: busy ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', flexShrink: 0 }}><i className="bi bi-send-fill"></i></button>
      </div>
    </div>
  );
}

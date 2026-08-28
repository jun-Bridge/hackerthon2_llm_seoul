import { useState, useRef, useEffect } from 'react';
import { useApp } from '../../store/AppContext';

export default function ChatModal({ onClose }) {
  const { addComplaint, complaints } = useApp();
  const [messages, setMessages] = useState([
    { sender: 'bot', text: '안녕하세요! 다듬이 AI에요.\n어떤 불편이 있으셨나요? 편하게 말씀해 주세요.' }
  ]);
  const [input, setInput] = useState('');
  const [step, setStep] = useState('idle');
  const [chatData, setChatData] = useState({ category: null, location: null, detail: null });
  const scrollRef = useRef(null);

  useEffect(() => { scrollRef.current?.scrollTo(0, 99999); }, [messages]);

  const addBotMsg = (text) => setMessages(prev => [...prev, { sender: 'bot', text }]);

  const guessCategory = (text) => {
    if (/에어컨|히터|냉방|난방|춥|더워/.test(text)) return '냉난방 / 설비';
    if (/화장실|세면대|물|변기|누수|온수/.test(text)) return '배관 / 위생';
    if (/프로젝터|빔|마이크|화면/.test(text)) return '기자재 / 영상';
    if (/콘센트|전기|충전|조명|깜빡/.test(text)) return '전기 / 설비';
    if (/열람실|자리|좌석|도서관/.test(text)) return '공간 / 편의';
    return '시설 / 환경';
  };

  const handleSend = () => {
    if (!input.trim()) return;
    const text = input.trim();
    setMessages(prev => [...prev, { sender: 'user', text }]);
    setInput('');
    setTimeout(() => processStep(text), 400);
  };

  const processStep = (text) => {
    if (step === 'idle') {
      const hasLoc = /관|층|호|도서관|화장실|실습실|열람실/.test(text);
      const hasIssue = /고장|새요|소음|소리|안 나|꺼져|깜빡|춥|더워|물이|안 돼|막힘/.test(text);
      if (hasLoc && hasIssue) {
        setChatData({ category: guessCategory(text), location: text, detail: text });
        setStep('confirm');
        addBotMsg(`내용을 정리했어요.\n\n위치: ${text}\n내용: ${text}\n\n"접수" 또는 "수정"을 입력해 주세요.`);
      } else if (hasLoc) {
        setChatData(prev => ({ ...prev, location: text, category: guessCategory(text) }));
        setStep('detail');
        addBotMsg(`${text}, 확인했습니다.\n어떤 문제가 발생했나요?`);
      } else {
        setChatData(prev => ({ ...prev, detail: text, category: guessCategory(text) }));
        setStep('location');
        addBotMsg(`불편하셨겠어요. 해당 문제가 어느 건물·공간에서 발생했나요?`);
      }
    } else if (step === 'location') {
      setChatData(prev => ({ ...prev, location: text }));
      setStep('confirm');
      addBotMsg(`내용을 정리했어요.\n\n위치: ${text}\n내용: ${chatData.detail}\n\n"접수" 또는 "수정"을 입력해 주세요.`);
    } else if (step === 'detail') {
      setChatData(prev => ({ ...prev, detail: text }));
      setStep('confirm');
      addBotMsg(`내용을 정리했어요.\n\n위치: ${chatData.location}\n내용: ${text}\n\n"접수" 또는 "수정"을 입력해 주세요.`);
    } else if (step === 'confirm') {
      if (text.includes('접수') || text.includes('네') || text.includes('확인')) {
        const newId = complaints.length > 0 ? Math.max(...complaints.map(c => c.id)) + 1 : 301;
        addComplaint({ id: newId, category: chatData.category || '시설 / 환경', location: chatData.location || '교내', rawText: chatData.detail || '', title: `${chatData.location || '교내'} 시설 점검 요청`, summary: chatData.detail || '', timestamp: new Date().toLocaleDateString('ko-KR'), status: '미확인', isMine: true });
        setStep('done');
        addBotMsg(`민원 #${newId}이 접수되었습니다!\n현황 탭에서 처리 상태를 확인하세요.`);
      } else {
        setStep('idle');
        setChatData({ category: null, location: null, detail: null });
        addBotMsg(`처음부터 다시 말씀해 주세요.`);
      }
    } else {
      addBotMsg(`새 민원을 작성하려면 대화를 닫고 다시 열어주세요.`);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#FFF', zIndex: 200, display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', flexShrink: 0 }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#0F172A' }}><i className="bi bi-arrow-left"></i></button>
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
      </div>
      <div style={{ padding: '10px 16px', borderTop: '1px solid #F1F5F9', display: 'flex', gap: '8px', alignItems: 'center', background: '#FFF', flexShrink: 0 }}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: '#F1F5F9', borderRadius: '9999px', padding: '0 14px', height: '42px' }}>
          <input type="text" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSend()} placeholder="메시지를 입력하세요" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: '0.85rem', color: '#0F172A' }} />
        </div>
        <button onClick={handleSend} style={{ width: '38px', height: '38px', borderRadius: '50%', background: '#2563EB', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', flexShrink: 0 }}><i className="bi bi-send-fill"></i></button>
      </div>
    </div>
  );
}

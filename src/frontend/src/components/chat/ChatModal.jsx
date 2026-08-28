import { useState, useRef, useEffect } from 'react';
import { useApp } from '../../store/AppContext';
import { useToast } from '../common/Toast';
import SubmitSuccessModal from './SubmitSuccessModal';

// 카테고리별 퀵칩
const locationChips = ['강의실', '실습실', '화장실', '도서관 열람실', '복도/계단'];
const detailChips = {
  '냉난방 / 설비': ['소음이 심해요', '바람이 안 나와요', '너무 춥거나 더워요'],
  '배관 / 위생': ['물이 새요', '온수가 안 나와요', '막혀있어요'],
  '기자재 / 영상': ['화면이 안 나와요', '소리가 안 나와요', '전원이 안 켜져요'],
  '전기 / 설비': ['전기가 안 들어와요', '전등이 깜빡거려요', '콘센트가 안 돼요'],
  '공간 / 편의': ['짐만 두고 자리 비워요', '너무 시끄러워요', '청결이 불량해요'],
};

export default function ChatModal({ onClose }) {
  const { addComplaint, complaints } = useApp();
  const { showToast } = useToast();
  const [messages, setMessages] = useState([
    { sender: 'bot', text: '안녕하세요! 다듬이 AI에요.\n어떤 불편이 있으셨나요? 편하게 말씀해 주세요.', chips: [] }
  ]);
  const [input, setInput] = useState('');
  const [step, setStep] = useState('idle');
  const [chatData, setChatData] = useState({ category: null, location: null, detail: null });
  const [stepHistory, setStepHistory] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [showConfirmCard, setShowConfirmCard] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [pendingImage, setPendingImage] = useState(null);
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => { scrollRef.current?.scrollTo(0, 99999); }, [messages, isTyping, showConfirmCard]);

  const guessCategory = (text) => {
    if (/에어컨|히터|냉방|난방|춥|더워/.test(text)) return '냉난방 / 설비';
    if (/화장실|세면대|물|변기|누수|온수/.test(text)) return '배관 / 위생';
    if (/프로젝터|빔|마이크|화면/.test(text)) return '기자재 / 영상';
    if (/콘센트|전기|충전|조명|깜빡/.test(text)) return '전기 / 설비';
    if (/열람실|자리|좌석|도서관/.test(text)) return '공간 / 편의';
    return '시설 / 환경';
  };

  const addBotMsg = (text, chips = []) => {
    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      setMessages(prev => [...prev, { sender: 'bot', text, chips }]);
    }, 500);
  };

  const handleImageSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPendingImage(reader.result);
    reader.readAsDataURL(file);
    e.target.value = ''; // 같은 파일 재선택 가능하게
  };

  const handleSend = () => {
    if (!input.trim() && !pendingImage) return;
    const text = input.trim();
    // 메시지에 이미지 미리보기 포함
    const msg = { sender: 'user', text: text || '(사진 첨부)', chips: [], image: pendingImage || null };
    setMessages(prev => [...prev, msg]);
    setInput('');
    setPendingImage(null);
    processStep(text);
  };

  const handleChipClick = (chipText) => {
    setMessages(prev => [...prev, { sender: 'user', text: chipText, chips: [] }]);
    processStep(chipText);
  };

  const processStep = (text) => {
    if (step === 'idle') {
      const hasLoc = /관|층|호|도서관|화장실|실습실|열람실/.test(text);
      const hasIssue = /고장|새요|소음|소리|안 나|꺼져|깜빡|춥|더워|물이|안 돼|막힘/.test(text);
      const cat = guessCategory(text);

      if (hasLoc && hasIssue) {
        setChatData({ category: cat, location: text, detail: text });
        setStepHistory(prev => [...prev, 'idle']);
        setStep('confirm');
        setTimeout(() => setShowConfirmCard(true), 300);
      } else if (hasLoc) {
        setChatData(prev => ({ ...prev, location: text, category: cat }));
        setStepHistory(prev => [...prev, 'idle']);
        setStep('detail');
        const chips = detailChips[cat] || ['고장났어요', '파손됐어요'];
        addBotMsg(`${text}, 확인했습니다.\n어떤 문제가 발생했나요?`, chips);
      } else {
        setChatData(prev => ({ ...prev, detail: text, category: cat }));
        setStepHistory(prev => [...prev, 'idle']);
        setStep('location');
        addBotMsg(`불편하셨겠어요. 해당 문제가 어느 건물·공간에서 발생했나요?`, locationChips);
      }
    } else if (step === 'location') {
      setChatData(prev => ({ ...prev, location: text }));
      setStepHistory(prev => [...prev, 'location']);
      setStep('confirm');
      setTimeout(() => setShowConfirmCard(true), 300);
    } else if (step === 'detail') {
      setChatData(prev => ({ ...prev, detail: text }));
      setStepHistory(prev => [...prev, 'detail']);
      setStep('confirm');
      setTimeout(() => setShowConfirmCard(true), 300);
    }
  };

  const handleSubmit = () => {
    const newId = complaints.length > 0 ? Math.max(...complaints.map(c => c.id)) + 1 : 301;
    addComplaint({
      id: newId, category: chatData.category || '시설 / 환경',
      location: chatData.location || '교내', rawText: chatData.detail || '',
      title: `${chatData.location || '교내'} 시설 점검 요청`,
      summary: chatData.detail || '',
      timestamp: new Date().toLocaleDateString('ko-KR'),
      status: '미확인', isMine: true
    });
    setStep('done');
    setShowConfirmCard(false);
    setShowSuccessModal(true);
    showToast(`민원 #${newId} 접수 완료!`);
  };

  const handleGoBack = () => {
    const prev = stepHistory[stepHistory.length - 1];
    setStepHistory(h => h.slice(0, -1));
    setShowConfirmCard(false);

    if (prev === 'detail' || step === 'confirm') {
      setChatData(d => ({ ...d, detail: null }));
      setStep('detail');
      const chips = detailChips[chatData.category] || ['고장났어요', '파손됐어요'];
      addBotMsg(`${chatData.location}에서 어떤 문제가 발생했나요? 다시 선택해 주세요.`, chips);
    } else if (prev === 'location') {
      setChatData(d => ({ ...d, location: null }));
      setStep('location');
      addBotMsg('위치를 다시 입력해 주세요.', locationChips);
    } else {
      setStep('idle');
      setChatData({ category: null, location: null, detail: null });
      addBotMsg('처음부터 다시 말씀해 주세요.');
    }
  };

  const handleReset = () => {
    setStep('idle');
    setChatData({ category: null, location: null, detail: null });
    setStepHistory([]);
    setShowConfirmCard(false);
    setMessages([{ sender: 'bot', text: '대화가 초기화되었습니다.\n어떤 불편이 있으셨나요?', chips: [] }]);
  };

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#FFF', zIndex: 200, display: 'flex', flexDirection: 'column' }}>
      {/* 헤더 */}
      <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', flexShrink: 0 }}>
        <button onClick={() => onClose(false)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#0F172A' }}>
          <i className="bi bi-arrow-left"></i>
        </button>
        <span style={{ fontWeight: 800, fontSize: '0.95rem' }}>새 민원 접수</span>
        <button onClick={handleReset} style={{ background: 'none', border: '1px solid #E2E8F0', borderRadius: '9999px', padding: '4px 10px', fontSize: '0.72rem', fontWeight: 600, color: '#475569', cursor: 'pointer' }}>
          초기화
        </button>
      </div>

      {/* 메시지 */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', background: 'linear-gradient(180deg, #BFDBFE 0%, #DBEAFE 15%, #EFF6FF 32%, #F8FAFC 52%, #FFFFFF 100%)' }}>
        {messages.map((m, i) => (
          <div key={i}>
            <div style={{ display: 'flex', justifyContent: m.sender === 'user' ? 'flex-end' : 'flex-start', gap: '8px', alignItems: 'flex-start' }}>
              {/* 봇 아바타 */}
              {m.sender === 'bot' && (
                <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: '#EFF6FF', border: '1px solid #DBEAFE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <iconify-icon icon="fluent-emoji:robot" width="18"></iconify-icon>
                </div>
              )}
              <div style={{
                maxWidth: '75%', padding: '10px 14px', borderRadius: '14px',
                background: m.sender === 'user' ? '#2563EB' : '#FFFFFF',
                color: m.sender === 'user' ? '#FFF' : '#0F172A',
                border: m.sender === 'bot' ? '1px solid #E2E8F0' : 'none',
                borderTopLeftRadius: m.sender === 'bot' ? '4px' : '14px',
                borderTopRightRadius: m.sender === 'user' ? '4px' : '14px',
                fontSize: '0.88rem', lineHeight: '1.55', whiteSpace: 'pre-wrap'
              }}>
                {m.image && <img src={m.image} alt="첨부" style={{ width: '100%', maxWidth: '180px', borderRadius: '8px', marginBottom: m.text ? '6px' : '0' }} />}
                {m.text}
              </div>
            </div>
            {m.sender === 'bot' && m.chips && m.chips.length > 0 && (
              <div className="chip-row" style={{ paddingLeft: '38px', marginTop: '6px', display: 'none' }}>
                {m.chips.map((c, j) => (
                  <button key={j} className="quick-chip" onClick={() => handleChipClick(c)}>{c}</button>
                ))}
              </div>
            )}
          </div>
        ))}

        {/* 타이핑 */}
        {isTyping && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{ padding: '10px 14px', borderRadius: '14px', background: '#FFF', border: '1px solid #E2E8F0' }}>
              <div className="typing-dots"><span></span><span></span><span></span></div>
            </div>
          </div>
        )}

        {/* 민원 요약 카드 (봇 버블 안 스타일) */}
        {showConfirmCard && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            {/* 봇 아바타 */}
            <div style={{ width: '30px', height: '30px', borderRadius: '50%', background: '#EFF6FF', border: '1px solid #DBEAFE', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <iconify-icon icon="fluent-emoji:robot" width="18"></iconify-icon>
            </div>
            <div style={{ flex: 1 }}>
              {/* 봇 텍스트 */}
              <div style={{ padding: '10px 14px', borderRadius: '14px', borderTopLeftRadius: '4px', background: '#FFFFFF', border: '1px solid #E2E8F0', fontSize: '0.88rem', lineHeight: '1.55', color: '#0F172A', marginBottom: '8px' }}>
                네, 내용을 정리했어요. 아래 내용을 확인해 주세요!
              </div>
              {/* 요약 카드 */}
              <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '20px', marginBottom: '8px' }}>
                <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0F172A', marginBottom: '16px' }}>민원 내용 요약</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '0.88rem' }}>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <i className="bi bi-tag" style={{ color: '#94A3B8', fontSize: '0.9rem', marginTop: '2px' }}></i>
                    <span style={{ color: '#94A3B8', fontWeight: 600, minWidth: '56px' }}>카테고리</span>
                    <span style={{ color: '#2563EB', fontWeight: 700 }}>{chatData.category || '○'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <i className="bi bi-geo-alt" style={{ color: '#94A3B8', fontSize: '0.9rem', marginTop: '2px' }}></i>
                    <span style={{ color: '#94A3B8', fontWeight: 600, minWidth: '56px' }}>위치</span>
                    <span style={{ color: '#0F172A' }}>{chatData.location || '○'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <i className="bi bi-file-text" style={{ color: '#94A3B8', fontSize: '0.9rem', marginTop: '2px' }}></i>
                    <span style={{ color: '#94A3B8', fontWeight: 600, minWidth: '56px' }}>내용 요약</span>
                    <span style={{ color: '#0F172A', lineHeight: '1.5' }}>{chatData.detail || '○'}</span>
                  </div>
                </div>
                <button onClick={handleSubmit} style={{ width: '100%', height: '48px', borderRadius: '12px', background: '#4F5FE8', color: '#FFF', fontSize: '0.95rem', fontWeight: 700, border: 'none', cursor: 'pointer', marginTop: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  민원 접수하기 →
                </button>
                <div onClick={handleGoBack} style={{ textAlign: 'center', marginTop: '12px', fontSize: '0.82rem', fontWeight: 600, color: '#94A3B8', cursor: 'pointer' }}>
                  ← 수정하기
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 이미지 미리보기 */}
      {pendingImage && (
        <div style={{ padding: '8px 16px', borderTop: '1px solid #F1F5F9', background: '#F8FAFC', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <img src={pendingImage} alt="첨부" style={{ width: '48px', height: '48px', borderRadius: '8px', objectFit: 'cover', border: '1px solid #E2E8F0' }} />
          <span style={{ fontSize: '0.78rem', color: '#64748B' }}>사진 1장 첨부됨</span>
          <button onClick={() => setPendingImage(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#94A3B8', fontSize: '1rem', cursor: 'pointer' }}>
            <i className="bi bi-x"></i>
          </button>
        </div>
      )}

      {/* 입력 */}
      <div style={{ padding: '10px 16px', borderTop: '1px solid #F1F5F9', display: 'flex', gap: '8px', alignItems: 'center', background: '#FFF', flexShrink: 0 }}>
        {/* + 버튼 (이미지 첨부) */}
        <button onClick={() => fileInputRef.current?.click()} style={{ width: '38px', height: '38px', borderRadius: '50%', background: '#F1F5F9', color: '#64748B', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0 }}>
          <i className="bi bi-plus-lg"></i>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleImageSelect}
        />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', background: '#F1F5F9', borderRadius: '9999px', padding: '0 14px', height: '42px' }}>
          <input
            type="text" value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="메시지를 입력하세요"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: '0.85rem', color: '#0F172A' }}
          />
        </div>
        <button onClick={handleSend} style={{ width: '38px', height: '38px', borderRadius: '50%', background: '#2563EB', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', flexShrink: 0 }}>
          <i className="bi bi-send-fill"></i>
        </button>
      </div>

      {/* 접수 완료 모달 */}
      {showSuccessModal && (
        <SubmitSuccessModal onConfirm={() => { setShowSuccessModal(false); onClose(true); }} />
      )}
    </div>
  );
}

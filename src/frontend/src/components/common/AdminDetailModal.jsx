import { useState } from 'react';
import { useApp } from '../../store/AppContext';
import { useToast } from './Toast';

// 상태 전이 규칙
function getAvailableTransitions(status) {
  switch (status) {
    case '미확인': return ['확인'];
    case '확인': return ['처리중', '보류', '거절'];
    case '처리중': return ['해결완료'];
    case '보류': return ['확인', '처리중'];
    default: return [];
  }
}

export default function AdminDetailModal({ complaint, onClose }) {
  const { changeStatus } = useApp();
  const { showToast } = useToast();
  const [comment, setComment] = useState(complaint.comment || '');
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState(null);

  if (!complaint) return null;

  const transitions = getAvailableTransitions(complaint.status);

  const handleAction = (newStatus) => {
    if (newStatus === '보류' && !comment.trim()) {
      showToast('보류 사유를 코멘트에 입력해 주세요.');
      return;
    }
    changeStatus(complaint.id, newStatus);
    showToast(`#${complaint.id} 상태 → ${newStatus}`);
    onClose();
  };

  const handleConfirmStatusChange = () => {
    if (selectedStatus) {
      handleAction(selectedStatus);
    }
    setShowStatusModal(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#FFFFFF', zIndex: 250, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      {/* 헤더 */}
      <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', flexShrink: 0 }}>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.3rem', color: '#0F172A', cursor: 'pointer' }}>
          <i className="bi bi-arrow-left"></i>
        </button>
        <span style={{ fontWeight: 800, fontSize: '1rem' }}>민원 상세 정보</span>
        <div style={{ display: 'flex', gap: '6px' }}>
          {complaint.status === '확인' && (
            <>
              <button onClick={() => handleAction('처리중')} style={{ padding: '6px 12px', borderRadius: '8px', background: '#2563EB', color: '#fff', border: 'none', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>수락</button>
              <button onClick={() => handleAction('보류')} style={{ padding: '6px 12px', borderRadius: '8px', background: '#fff', color: '#475569', border: '1px solid #E2E8F0', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>보류</button>
              <button onClick={() => handleAction('거절')} style={{ padding: '6px 12px', borderRadius: '8px', background: '#fff', color: '#B91C1C', border: '1px solid #FCA5A5', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>거절</button>
            </>
          )}
          {complaint.status === '처리중' && (
            <button onClick={() => handleAction('해결완료')} style={{ padding: '6px 12px', borderRadius: '8px', background: '#16A34A', color: '#fff', border: 'none', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>해결완료</button>
          )}
          {transitions.length > 0 && (
            <button onClick={() => { setSelectedStatus(transitions[0]); setShowStatusModal(true); }} style={{ padding: '6px 12px', borderRadius: '8px', background: '#0F172A', color: '#fff', border: 'none', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>수정</button>
          )}
        </div>
      </div>

      {/* 바디 */}
      <div style={{ padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* 정보 카드 */}
        <div style={{ border: '1px solid #E2E8F0', borderRadius: '14px', overflow: 'hidden' }}>
          {[
            { label: '제목', value: complaint.title },
            { label: '위치', value: complaint.location },
            { label: '접수일', value: complaint.timestamp },
            { label: '상태', value: complaint.status, color: '#2563EB' },
          ].map((row, i) => (
            <div key={i} style={{ padding: '16px 18px', borderBottom: i < 3 ? '1px solid #F1F5F9' : 'none', display: 'flex', alignItems: 'baseline' }}>
              <span style={{ width: '60px', fontSize: '0.85rem', fontWeight: 800, color: '#0F172A' }}>{row.label}</span>
              <span style={{ fontSize: '0.9rem', color: row.color || '#0F172A', fontWeight: row.color ? 700 : 400 }}>{row.value}</span>
            </div>
          ))}
        </div>

        {/* 코멘트 */}
        <div>
          <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0F172A', marginBottom: '8px' }}>코멘트</div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="내부 코멘트를 입력하세요"
            style={{ width: '100%', minHeight: '90px', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '14px', fontSize: '0.88rem', resize: 'none', outline: 'none', background: '#FAFAFA', color: '#0F172A' }}
          />
        </div>

        {/* 민원 내용 */}
        <div style={{ border: '1px solid #E2E8F0', borderRadius: '14px', padding: '18px' }}>
          <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0F172A', marginBottom: '10px' }}>민원 내용</div>
          <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.7' }}>
            {complaint.rawText || complaint.summary || '-'}
          </div>
        </div>
      </div>

      {/* 상태 변경 모달 */}
      {showStatusModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: '#FFF', borderRadius: '14px', padding: '24px', maxWidth: '300px', width: '100%', boxShadow: '0 20px 40px rgba(0,0,0,0.12)' }}>
            <div style={{ fontSize: '1rem', fontWeight: 800, textAlign: 'center', marginBottom: '16px' }}>처리 상태 변경</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
              {transitions.map(s => (
                <label key={s} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '6px 0' }}>
                  <input type="radio" name="statusRadio" checked={selectedStatus === s} onChange={() => setSelectedStatus(s)} style={{ width: '18px', height: '18px', accentColor: '#2563EB' }} />
                  <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{s}</span>
                </label>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={handleConfirmStatusChange} style={{ flex: 1, height: '42px', borderRadius: '10px', background: '#2563EB', color: '#fff', fontSize: '0.88rem', fontWeight: 700, border: 'none', cursor: 'pointer' }}>변경하기</button>
              <button onClick={() => setShowStatusModal(false)} style={{ flex: 1, height: '42px', borderRadius: '10px', background: '#fff', color: '#0F172A', fontSize: '0.88rem', fontWeight: 700, border: '1px solid #E2E8F0', cursor: 'pointer' }}>취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

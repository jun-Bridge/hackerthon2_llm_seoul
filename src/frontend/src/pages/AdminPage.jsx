import { useState } from 'react';
import { useApp } from '../store/AppContext';
import AdminDetailModal from '../components/common/AdminDetailModal';
import PageHeader from '../components/common/PageHeader';

export default function AdminPage() {
  const { complaints, changeStatus } = useApp();
  const [selectedId, setSelectedId] = useState(null);

  const proc = complaints.filter(c => c.status === '처리중').length;
  const done = complaints.filter(c => c.status === '해결완료').length;
  const hold = complaints.filter(c => c.status === '보류' || c.status === '거절').length;

  const handleOpen = (id) => {
    // 자동 "미확인→확인" 전이
    const item = complaints.find(c => c.id === id);
    if (item && item.status === '미확인') {
      changeStatus(id, '확인');
    }
    setSelectedId(id);
  };

  const selectedComplaint = complaints.find(c => c.id === selectedId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', background: '#FFFFFF', margin: '-10px -16px -80px', paddingBottom: '80px' }}>
      <PageHeader title="관리자 페이지" />
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* 통계 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden', background: '#FFFFFF' }}>
        {[
          { l: '전체', v: complaints.length },
          { l: '처리중', v: proc },
          { l: '해결완료', v: done },
          { l: '보류/거절', v: hold }
        ].map((s, i) => (
          <div key={i} style={{ padding: '12px 6px', textAlign: 'center', borderRight: i < 3 ? '1px solid #F1F5F9' : 'none' }}>
            <div style={{ fontSize: '0.7rem', color: '#94A3B8', fontWeight: 600, marginBottom: '2px' }}>{s.l}</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0F172A' }}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* 목록 */}
      <div>
        <div style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '12px' }}>최근 민원 목록</div>
        {complaints.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#94A3B8' }}>접수된 민원이 없습니다</div>
        ) : complaints.map(c => (
          <div key={c.id} onClick={() => handleOpen(c.id)} style={{ padding: '16px 2px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#CBD5E1', minWidth: '32px', textAlign: 'center' }}>{c.id}</span>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span className={`status-pill status-${c.status}`} style={{ alignSelf: 'flex-start', fontSize: '0.7rem' }}>{c.status}</span>
              <span style={{ fontSize: '0.92rem', fontWeight: 700, color: '#0F172A' }}>{c.title}</span>
              <span style={{ fontSize: '0.78rem', color: '#94A3B8' }}>{c.location} · {c.timestamp}</span>
            </div>
            <i className="bi bi-chevron-right" style={{ color: '#D1D5DB' }}></i>
          </div>
        ))}
      </div>

      {/* 상세 모달 */}
      {selectedComplaint && (
        <AdminDetailModal complaint={selectedComplaint} onClose={() => setSelectedId(null)} />
      )}
      </div>
    </div>
  );
}

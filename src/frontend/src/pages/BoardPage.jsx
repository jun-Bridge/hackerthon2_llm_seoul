import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { CATEGORIES, CATEGORY_SHORT, formatDate } from '../store/constants';
import ComplaintDetailModal from '../components/common/ComplaintDetailModal';

// '전체' + 백엔드 정본 카테고리 8종
const TABS = ['전체', ...CATEGORIES];
const SHORT = { '전체': '전체', ...CATEGORY_SHORT };

export default function BoardPage() {
  const { complaints, user, refreshComplaints, replaceComplaint, removeComplaint } = useApp();
  const [filter, setFilter] = useState('전체');
  const [openId, setOpenId] = useState(null);
  const isAdmin = user?.role === 'admin';
  const filtered = filter === '전체' ? complaints : complaints.filter(c => c.category === filter);

  const handleChanged = (u) => {
    if (u.__withdrawn) { removeComplaint(u.id); refreshComplaints().catch(() => {}); }
    else replaceComplaint(u);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <h2 style={{ fontSize: '1.15rem', fontWeight: 800 }}>캠퍼스 전체 게시판</h2>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {TABS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: '6px 12px', borderRadius: '9999px', border: '1px solid #E2E8F0', background: filter === f ? '#0F172A' : '#FFF', color: filter === f ? '#FFF' : '#475569', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>{SHORT[f]}</button>
        ))}
      </div>
      <div>
        {filtered.length === 0 ? <div style={{ textAlign: 'center', padding: '3rem', color: '#94A3B8' }}>등록된 민원이 없습니다</div> :
          filtered.map(c => (
            <div key={c.id} onClick={() => setOpenId(c.id)} style={{ padding: '14px 0', borderBottom: '1px solid #F1F5F9', display: 'flex', flexDirection: 'column', gap: '4px', cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.92rem', fontWeight: 700, color: '#0F172A', flex: 1 }}>{c.title}</span>
                <span className={`status-pill status-${c.status}`} style={{ flexShrink: 0, marginLeft: '8px' }}>{c.status}</span>
              </div>
              <div style={{ fontSize: '0.78rem', color: '#94A3B8' }}>{c.location} &nbsp; {formatDate(c.created_at)}</div>
            </div>
          ))}
      </div>
      {openId != null && (
        <ComplaintDetailModal complaintId={openId} isAdmin={isAdmin} onClose={() => setOpenId(null)} onChanged={handleChanged} />
      )}
    </div>
  );
}

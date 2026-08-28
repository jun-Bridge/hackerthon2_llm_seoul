import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { formatDate } from '../store/constants';
import ComplaintDetailModal from '../components/common/ComplaintDetailModal';

const FILTERS = ['전체', '미확인', '확인', '처리중', '해결완료', '보류', '거절'];

export default function StatusPage() {
  const { complaints, refreshComplaints, replaceComplaint, removeComplaint } = useApp();
  const [filter, setFilter] = useState('전체');
  const [openId, setOpenId] = useState(null);
  const myList = complaints.filter(c => c.is_mine);
  const filtered = filter === '전체' ? myList : myList.filter(c => c.status === filter);

  const handleChanged = (u) => {
    if (u.__withdrawn) { removeComplaint(u.id); refreshComplaints().catch(() => {}); }
    else replaceComplaint(u);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <h2 style={{ fontSize: '1.15rem', fontWeight: 800 }}>내 민원 현황</h2>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: '6px 14px', borderRadius: '9999px', border: '1px solid #E2E8F0', background: filter === f ? '#0F172A' : '#FFF', color: filter === f ? '#FFF' : '#475569', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>{f}</button>
        ))}
      </div>
      <div>
        {filtered.length === 0 ? <div style={{ textAlign: 'center', padding: '3rem', color: '#94A3B8' }}>접수한 민원이 없습니다</div> :
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
        <ComplaintDetailModal complaintId={openId} isAdmin={false} onClose={() => setOpenId(null)} onChanged={handleChanged} />
      )}
    </div>
  );
}

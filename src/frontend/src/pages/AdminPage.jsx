import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { formatDate } from '../store/constants';
import ComplaintDetailModal from '../components/common/ComplaintDetailModal';

const FILTERS = ['전체', '미확인', '확인', '처리중', '해결완료', '보류', '거절'];

export default function AdminPage() {
  const { complaints, stats, refreshComplaints, refreshStats, replaceComplaint, removeComplaint } = useApp();
  const [openId, setOpenId] = useState(null);
  const [filter, setFilter] = useState('전체');

  const by = stats?.by_status || {};
  const total = stats?.total ?? complaints.length;
  const filtered = filter === '전체' ? complaints : complaints.filter(c => c.status === filter);

  const handleChanged = (u) => {
    if (u.__withdrawn) removeComplaint(u.id);
    else replaceComplaint(u);
    refreshStats().catch(() => {});         // 상태 바뀌면 통계 재계산
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>관리자 페이지</h2>

      {/* 통계 카드 — 백엔드 /admin/stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden' }}>
        {[
          { l: '전체', v: total },
          { l: '미확인', v: by['미확인'] ?? 0 },
          { l: '처리중', v: by['처리중'] ?? 0 },
          { l: '해결완료', v: by['해결완료'] ?? 0 },
        ].map((s, i) => (
          <div key={i} style={{ padding: '12px 6px', textAlign: 'center', borderRight: i < 3 ? '1px solid #F1F5F9' : 'none' }}>
            <div style={{ fontSize: '0.7rem', color: '#94A3B8', fontWeight: 600, marginBottom: '2px' }}>{s.l}</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0F172A' }}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* 상태 필터 */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {FILTERS.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: '5px 12px', borderRadius: '9999px', border: '1px solid #E2E8F0', background: filter === f ? '#0F172A' : '#FFF', color: filter === f ? '#FFF' : '#475569', fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer' }}>{f}</button>
        ))}
      </div>

      <div>
        <div style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '12px' }}>민원 목록</div>
        {filtered.length === 0 ? <div style={{ textAlign: 'center', padding: '2rem', color: '#94A3B8' }}>민원이 없습니다</div> :
          filtered.map(c => (
            <div key={c.id} onClick={() => setOpenId(c.id)} style={{ padding: '16px 2px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#CBD5E1', minWidth: '32px', textAlign: 'center' }}>{c.id}</span>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span className={`status-pill status-${c.status}`} style={{ alignSelf: 'flex-start', fontSize: '0.7rem' }}>{c.status}</span>
                <span style={{ fontSize: '0.92rem', fontWeight: 700, color: '#0F172A' }}>{c.title}</span>
                <span style={{ fontSize: '0.78rem', color: '#94A3B8' }}>{c.location} · {formatDate(c.created_at)}</span>
              </div>
              <i className="bi bi-chevron-right" style={{ color: '#D1D5DB' }}></i>
            </div>
          ))}
      </div>

      {openId != null && (
        <ComplaintDetailModal complaintId={openId} isAdmin={true} onClose={() => setOpenId(null)} onChanged={handleChanged} />
      )}
    </div>
  );
}

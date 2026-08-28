import { useState } from 'react';
import { useApp } from '../store/AppContext';

const FILTERS = ['전체', '처리중', '해결완료', '보류', '거절'];

export default function StatusPage() {
  const { complaints } = useApp();
  const [filter, setFilter] = useState('전체');
  const myList = complaints.filter(c => c.isMine);
  const filtered = filter === '전체' ? myList : myList.filter(c => c.status === filter);

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
            <div key={c.id} style={{ padding: '14px 0', borderBottom: '1px solid #F1F5F9', display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.92rem', fontWeight: 700, color: '#0F172A', flex: 1 }}>{c.title}</span>
                <span className={`status-pill status-${c.status}`} style={{ flexShrink: 0, marginLeft: '8px' }}>{c.status}</span>
              </div>
              <div style={{ fontSize: '0.78rem', color: '#94A3B8' }}>{c.location} &nbsp; {c.timestamp}</div>
            </div>
          ))}
      </div>
    </div>
  );
}

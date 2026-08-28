import { useState } from 'react';
import { useApp } from '../store/AppContext';

const CATEGORIES = ['전체', '냉난방 / 설비', '배관 / 위생', '전기 / 설비', '기자재 / 영상', '공간 / 편의', '기타'];
const SHORT = { '전체': '전체', '냉난방 / 설비': '냉난방', '배관 / 위생': '위생/배관', '전기 / 설비': '전기', '기자재 / 영상': '기자재', '공간 / 편의': '공간', '기타': '기타' };

export default function BoardPage() {
  const { complaints } = useApp();
  const [filter, setFilter] = useState('전체');
  const filtered = filter === '전체' ? complaints : filter === '기타' ? complaints.filter(c => !['냉난방 / 설비','배관 / 위생','전기 / 설비','기자재 / 영상','공간 / 편의'].includes(c.category)) : complaints.filter(c => c.category === filter);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <h2 style={{ fontSize: '1.15rem', fontWeight: 800 }}>캠퍼스 전체 게시판</h2>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {CATEGORIES.map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: '6px 12px', borderRadius: '9999px', border: '1px solid #E2E8F0', background: filter === f ? '#0F172A' : '#FFF', color: filter === f ? '#FFF' : '#475569', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}>{SHORT[f]}</button>
        ))}
      </div>
      <div>
        {filtered.length === 0 ? <div style={{ textAlign: 'center', padding: '3rem', color: '#94A3B8' }}>등록된 민원이 없습니다</div> :
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

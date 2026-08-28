import { useState } from 'react';
import { useApp } from '../store/AppContext';
import PageHeader from '../components/common/PageHeader';

const FILTERS = ['전체', '처리중', '해결완료', '보류', '거절'];

export default function StatusPage() {
  const { complaints } = useApp();
  const [filter, setFilter] = useState('전체');
  const [search, setSearch] = useState('');

  const myList = complaints.filter(c => c.is_mine);
  const statusFiltered = filter === '전체' ? myList : myList.filter(c => c.status === filter);
  const filtered = statusFiltered.filter(c =>
    !search || (c.title || '').includes(search) || (c.location || '').includes(search)
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', background: '#FFFFFF', margin: '-10px -16px -80px', paddingBottom: '80px' }}>
      <PageHeader title="내 민원 현황" />

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* 필터 칩 */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '7px 14px', borderRadius: '9999px',
              border: filter === f ? '1.5px solid #2563EB' : '1px solid #E2E8F0',
              background: filter === f ? '#EFF6FF' : '#FFFFFF',
              color: filter === f ? '#2563EB' : '#475569',
              fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer'
            }}>{f}</button>
          ))}
        </div>

        {/* 검색 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#F1F5F9', borderRadius: '9999px', padding: '8px 14px' }}>
          <i className="bi bi-search" style={{ color: '#94A3B8', fontSize: '0.85rem' }}></i>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="검색" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: '0.85rem', color: '#0F172A' }} />
        </div>

        {/* 리스트 */}
        <div>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#94A3B8' }}>접수한 민원이 없습니다</div>
          ) : filtered.map(c => (
            <div key={c.id} style={{ padding: '16px 4px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#2563EB', background: '#EFF6FF', padding: '2px 8px', borderRadius: '9999px' }}>{c.category}</span>
                  <span className={`status-pill status-${c.status}`}>{c.status}</span>
                </div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#0F172A', marginBottom: '4px', lineHeight: '1.4' }}>{c.title}</div>
                <div style={{ fontSize: '0.78rem', color: '#94A3B8' }}>{c.location} · {c.timestamp}</div>
              </div>
              <i className="bi bi-chevron-right" style={{ color: '#D1D5DB', fontSize: '1rem' }}></i>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

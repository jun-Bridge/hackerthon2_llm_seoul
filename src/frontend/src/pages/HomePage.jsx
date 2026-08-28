import { useApp } from '../store/AppContext';
import { formatDate } from '../store/constants';
import '../styles/home.css';

export default function HomePage({ onOpenChat, onTabChange }) {
  const { user, complaints } = useApp();
  const isAdmin = user?.role === 'admin' || user?.role === 'staff';
  const myList = complaints.filter(c => c.is_mine);
  const processing = myList.filter(c => c.status === '처리중').length;
  const done = myList.filter(c => c.status === '해결완료').length;

  return (
    <div className="home-page">
      <div className="greeting">안녕하세요, <span className="greeting-name">{user?.email?.split('@')[0] || 'student'}님</span></div>

      <div className="input-trigger" onClick={onOpenChat}>
        <span>불편한 점을 편하게 적어주세요</span>
        <i className="bi bi-arrow-right" style={{ color: '#2563EB', fontWeight: 700 }}></i>
      </div>

      {/* 캠퍼스 지도 placeholder */}
      <div style={{
        width: '100%', height: '200px', borderRadius: '14px',
        background: '#E2E8F0', display: 'flex', alignItems: 'center',
        justifyContent: 'center', position: 'relative', overflow: 'hidden'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', color: '#94A3B8' }}>
          <i className="bi bi-geo-alt" style={{ fontSize: '1.5rem' }}></i>
          <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>캠퍼스 민원 지도</span>
        </div>
        {/* 핀 마커 데모 */}
        <div style={{ position: 'absolute', top: '30%', left: '25%', width: '10px', height: '10px', borderRadius: '50%', background: '#EF4444', border: '2px solid #FFF', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}></div>
        <div style={{ position: 'absolute', top: '50%', left: '60%', width: '10px', height: '10px', borderRadius: '50%', background: '#F59E0B', border: '2px solid #FFF', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}></div>
        <div style={{ position: 'absolute', top: '65%', left: '40%', width: '10px', height: '10px', borderRadius: '50%', background: '#2563EB', border: '2px solid #FFF', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}></div>
      </div>

      {/* 민원 현황 카드 */}
      <div className="stats-card-blue" onClick={() => onTabChange && onTabChange(isAdmin ? 'admin' : 'status')}>
        <div className="stats-header">
          <span className="stats-title">{isAdmin ? '전체 민원 현황' : '내 민원 현황'}</span>
          <span className="stats-link">{isAdmin ? '관리 →' : '전체보기 →'}</span>
        </div>
        <div className="stats-row">
          <span>전체 <b>{isAdmin ? complaints.length : myList.length}</b>건</span>
          <span>/ 처리중 <b>{processing}</b>건</span>
          <span>/ 해결완료 <b>{done}</b>건</span>
        </div>
      </div>

      {/* 최근 민원 */}
      <div className="recent-section">
        <div className="recent-header">
          <span className="recent-title">최근 민원</span>
          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#2563EB', cursor: 'pointer' }} onClick={() => onTabChange && onTabChange('board')}>전체보기 →</span>
        </div>
        {complaints.slice(0, 5).map(c => (
          <div key={c.id} className="recent-row">
            <div className="recent-row-top">
              <span className="recent-row-title">{c.title}</span>
              <span className={`status-pill status-${c.status}`}>{c.status}</span>
            </div>
            <div className="recent-row-meta">{c.location} &nbsp; {c.created_at ? formatDate(c.created_at) : c.timestamp || ''}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

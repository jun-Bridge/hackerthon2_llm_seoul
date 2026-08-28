import { useApp } from '../store/AppContext';
import '../styles/home.css';

export default function HomePage({ onOpenChat }) {
  const { user, complaints } = useApp();
  const myList = complaints.filter(c => c.isMine);
  const processing = myList.filter(c => c.status === '처리중').length;
  const done = myList.filter(c => c.status === '해결완료').length;

  const categories = [
    { label: '냉난방', icon: 'bi-snow2' },
    { label: '누수/위생', icon: 'bi-droplet' },
    { label: '기자재', icon: 'bi-display' },
    { label: '전기', icon: 'bi-lightning-charge' },
  ];

  return (
    <div className="home-page">
      <div className="greeting">안녕하세요, <span className="greeting-name">{user?.email?.split('@')[0] || 'student'}님</span></div>

      <div className="input-trigger" onClick={onOpenChat}>
        <span>불편한 점을 편하게 적어주세요</span>
        <i className="bi bi-arrow-right" style={{ color: '#2563EB', fontWeight: 700 }}></i>
      </div>

      <div className="anon-banner" onClick={onOpenChat}>
        <div>
          <div className="anon-title">100% 익명 보장</div>
          <div className="anon-sub">AI가 공문서로 변환해드려요</div>
        </div>
      </div>

      <div className="cat-grid">
        {categories.map(c => (
          <div key={c.label} className="cat-item" onClick={onOpenChat}>
            <div className="cat-circle"><i className={`bi ${c.icon}`}></i></div>
            <span className="cat-label">{c.label}</span>
          </div>
        ))}
      </div>

      <div className="stats-card-blue">
        <div className="stats-header">
          <span className="stats-title">내 민원 현황</span>
          <span className="stats-link">전체보기 →</span>
        </div>
        <div className="stats-row">
          <span>전체 <b>{myList.length}</b>건</span>
          <span>/ 처리중 <b style={{ color: '#FDE68A' }}>{processing}</b>건</span>
          <span>/ 해결완료 <b style={{ color: '#86EFAC' }}>{done}</b>건</span>
        </div>
      </div>

      <div className="recent-section">
        <div className="recent-header"><span className="recent-title">최근 내 민원</span></div>
        {myList.slice(0, 3).map(c => (
          <div key={c.id} className="recent-row">
            <div className="recent-row-top">
              <span className="recent-row-title">{c.title}</span>
              <span className={`status-pill status-${c.status}`}>{c.status}</span>
            </div>
            <div className="recent-row-meta">{c.location} &nbsp; {c.timestamp}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

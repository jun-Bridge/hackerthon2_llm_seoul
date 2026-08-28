import '../../styles/layout.css';

export default function Header({ onProfileClick }) {
  return (
    <header className="app-header">
      <div className="header-left">
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
          <path d="M4 14C4 8.48 8.48 4 14 4C19.52 4 24 8.48 24 14C24 19.52 19.52 24 14 24" stroke="#2563EB" strokeWidth="3" strokeLinecap="round"/>
          <path d="M4 4V24" stroke="#2563EB" strokeWidth="3" strokeLinecap="round"/>
          <path d="M4 14H8" stroke="#2563EB" strokeWidth="3" strokeLinecap="round"/>
        </svg>
        <span className="header-brand">다듬이</span>
      </div>
      <div className="header-right">
        <button className="header-icon-btn"><i className="bi bi-bell"></i></button>
        <button className="header-avatar" onClick={onProfileClick}><i className="bi bi-person"></i></button>
      </div>
    </header>
  );
}

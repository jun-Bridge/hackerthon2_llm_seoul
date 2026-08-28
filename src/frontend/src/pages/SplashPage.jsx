import '../styles/auth.css';

export default function SplashPage({ onStart }) {
  return (
    <div className="splash-screen">
      <div className="splash-logo-group">
        <svg width="56" height="56" viewBox="0 0 28 28" fill="none">
          <path d="M4 14C4 8.48 8.48 4 14 4C19.52 4 24 8.48 24 14C24 19.52 19.52 24 14 24" stroke="#2563EB" strokeWidth="3" strokeLinecap="round"/>
          <path d="M4 4V24" stroke="#2563EB" strokeWidth="3" strokeLinecap="round"/>
          <path d="M4 14H8" stroke="#2563EB" strokeWidth="3" strokeLinecap="round"/>
        </svg>
        <span className="splash-brand">다듬이</span>
        <span className="splash-sub">AI 익명 캠퍼스 민원 도우미</span>
      </div>
      <button className="btn-primary-full" onClick={onStart}>시작하기</button>
    </div>
  );
}

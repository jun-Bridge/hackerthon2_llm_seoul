import "../../styles/layout.css";

export default function Header({ onProfileClick }) {
  return (
    <header className="app-header">
      <div className="header-left">
        <img
          src="/logo.png"
          alt="다듬이 로고"
          style={{ width: "28px", height: "28px", objectFit: "contain" }}
        />
        <span className="header-brand">다듬이</span>
      </div>
      <div className="header-right">
        <button className="header-icon-btn">
          <i className="bi bi-bell"></i>
        </button>
        <button className="header-avatar" onClick={onProfileClick}>
          <i className="bi bi-person"></i>
        </button>
      </div>
    </header>
  );
}

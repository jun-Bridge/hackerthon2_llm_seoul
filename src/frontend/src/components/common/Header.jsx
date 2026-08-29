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
        <button className="header-avatar" onClick={onProfileClick}>
          <img src="/dadumi-face-brave.png" alt="프로필" style={{ width: "74%", height: "74%", objectFit: "contain" }} />
        </button>
      </div>
    </header>
  );
}

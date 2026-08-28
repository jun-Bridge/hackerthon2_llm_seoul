import "../styles/auth.css";

export default function SplashPage({ onStart }) {
  return (
    <div className="splash-screen">
      <div className="splash-logo-group">
        <img
          src="/logo.png"
          alt="다듬이 로고"
          style={{ width: "56px", height: "56px", objectFit: "contain" }}
        />
        <span className="splash-brand">다듬이</span>
        <span className="splash-sub">AI 익명 캠퍼스 민원 도우미</span>
      </div>
      <button className="btn-primary-full" onClick={onStart}>
        시작하기
      </button>
    </div>
  );
}

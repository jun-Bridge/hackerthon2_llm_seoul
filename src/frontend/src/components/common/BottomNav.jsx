import '../../styles/layout.css';

export default function BottomNav({ currentTab, onTabChange, isAdmin, onFabClick }) {
  return (
    <nav className="bottom-nav">
      <button className={`tab-btn ${currentTab === 'home' ? 'active' : ''}`} onClick={() => onTabChange('home')}>
        <i className="bi bi-house-door-fill"></i><span>홈</span>
      </button>
      {isAdmin ? (
        <button className={`tab-btn ${currentTab === 'admin' ? 'active' : ''}`} onClick={() => onTabChange('admin')}>
          <i className="bi bi-shield-check"></i><span>관리</span>
        </button>
      ) : (
        <button className={`tab-btn ${currentTab === 'status' ? 'active' : ''}`} onClick={() => onTabChange('status')}>
          <i className="bi bi-clipboard-check"></i><span>현황</span>
        </button>
      )}
      {/* 민원 접수(채팅)는 학생 전용. 관리자에겐 FAB를 아예 렌더하지 않는다
          — 백엔드 /chat-sessions 가 require_student 라 관리자가 누르면 403이 난다. */}
      {!isAdmin && (
        <div className="fab-wrap">
          <button className="fab-btn" onClick={onFabClick}><i className="bi bi-plus-lg"></i></button>
        </div>
      )}
      <button className={`tab-btn ${currentTab === 'board' ? 'active' : ''}`} onClick={() => onTabChange('board')}>
        <i className="bi bi-list-ul"></i><span>게시판</span>
      </button>
      <button className={`tab-btn ${currentTab === 'profile' ? 'active' : ''}`} onClick={() => onTabChange('profile')}>
        <i className="bi bi-person"></i><span>프로필</span>
      </button>
    </nav>
  );
}

import { useApp } from '../store/AppContext';
<<<<<<< HEAD
import { useToast } from '../components/common/Toast';
=======
>>>>>>> 48e58d9597a200c22373ae87f3c87fdb954fbaee
import { logout } from '../api/auth';

export default function ProfilePage() {
  const { user, setUser } = useApp();
  const handleLogout = async () => {
    try { await logout(); } catch { /* 세션 없어도 진행 */ }
    setUser(null);   // 프론트 상태 초기화 → App이 로그인 화면으로
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '20px 0' }}>
      <h2 style={{ fontSize: '1.15rem', fontWeight: 800 }}>프로필</h2>
      <div style={{ background: '#F8FAFC', borderRadius: '14px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem' }}>
          <span style={{ color: '#64748B', fontWeight: 600 }}>이메일</span>
          <span style={{ color: '#0F172A', fontWeight: 600 }}>{user?.email}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem' }}>
          <span style={{ color: '#64748B', fontWeight: 600 }}>역할</span>
          <span style={{ color: '#2563EB', fontWeight: 700 }}>{user?.role === 'admin' ? '교직원' : '학생'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem' }}>
          <span style={{ color: '#64748B', fontWeight: 600 }}>학교</span>
          <span style={{ color: '#0F172A', fontWeight: 600 }}>{user?.school_name}</span>
        </div>
      </div>
<<<<<<< HEAD

      {/* 계정 정보 */}
      <div style={{ margin: '16px', border: '1px solid #E2E8F0', borderRadius: '14px', overflow: 'hidden', background: '#FFFFFF' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #F1F5F9' }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#94A3B8', marginBottom: '12px' }}>계정 정보</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#0F172A' }}>이메일 아이디</span>
              <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0F172A' }}>{user?.email}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#0F172A' }}>비밀번호</span>
              <span style={{ fontSize: '0.88rem', color: '#0F172A', letterSpacing: '2px' }}>••••••••</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#0F172A' }}>소속 캠퍼스</span>
              <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#0F172A' }}>{user?.schoolName || '국립군산대학교'}</span>
            </div>
          </div>
        </div>

        {/* 교직원 인증 */}
        {!isAdmin && (
          <div style={{ padding: '14px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#2563EB' }}>교직원 / 관리자 인증</span>
              <span style={{ fontSize: '0.72rem', color: '#2563EB', fontWeight: 600 }}>시설관리처 전용</span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="text"
                value={adminCode}
                onChange={(e) => setAdminCode(e.target.value)}
                placeholder="교직원 관리자 코드 입력"
                style={{ flex: 1, padding: '10px 14px', border: '1px solid #E2E8F0', borderRadius: '10px', fontSize: '0.85rem', outline: 'none', color: '#0F172A' }}
              />
              <button onClick={handleAdminVerify} style={{ padding: '10px 16px', borderRadius: '10px', background: '#0F172A', color: '#FFFFFF', fontSize: '0.82rem', fontWeight: 700, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                인증하기
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 로그아웃 */}
      <div style={{ margin: '0 16px', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => { logout().catch(() => {}); setUser(null); window.location.reload(); }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <i className="bi bi-box-arrow-left" style={{ color: '#EF4444', fontSize: '1rem' }}></i>
          <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#EF4444' }}>로그아웃</span>
        </div>
        <i className="bi bi-chevron-right" style={{ color: '#CBD5E1' }}></i>
      </div>
=======
      <button onClick={handleLogout} style={{ width: '100%', padding: '14px', borderRadius: '12px', background: '#FFF', border: '1px solid #FCA5A5', color: '#B91C1C', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer' }}>로그아웃</button>
>>>>>>> 48e58d9597a200c22373ae87f3c87fdb954fbaee
    </div>
  );
}

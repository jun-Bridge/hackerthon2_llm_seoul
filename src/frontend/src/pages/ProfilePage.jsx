import { useApp } from '../store/AppContext';
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
      <button onClick={handleLogout} style={{ width: '100%', padding: '14px', borderRadius: '12px', background: '#FFF', border: '1px solid #FCA5A5', color: '#B91C1C', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer' }}>로그아웃</button>
    </div>
  );
}

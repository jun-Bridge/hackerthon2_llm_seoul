import { useApp } from '../store/AppContext';

export default function ProfilePage() {
  const { user, setUser } = useApp();
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
          <span style={{ color: '#2563EB', fontWeight: 700 }}>{user?.role === 'staff' ? '교직원' : '학생'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem' }}>
          <span style={{ color: '#64748B', fontWeight: 600 }}>학교</span>
          <span style={{ color: '#0F172A', fontWeight: 600 }}>{user?.schoolName}</span>
        </div>
      </div>
      <button onClick={() => setUser(null)} style={{ width: '100%', padding: '14px', borderRadius: '12px', background: '#FFF', border: '1px solid #FCA5A5', color: '#B91C1C', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer' }}>로그아웃</button>
    </div>
  );
}

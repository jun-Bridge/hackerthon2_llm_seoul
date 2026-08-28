import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { useToast } from '../components/common/Toast';
import { logout } from '../api/auth';

export default function ProfilePage() {
  const { user, setUser } = useApp();
  const { showToast } = useToast();
  const [adminCode, setAdminCode] = useState('');

  const emailId = user?.email?.split('@')[0] || 'student';
  const isAdmin = user?.role === 'admin' || user?.role === 'staff';

  const handleAdminVerify = () => {
    if (!adminCode.trim()) {
      showToast('관리자 코드를 입력해 주세요.');
      return;
    }
    setUser({ ...user, role: 'staff' });
    showToast('교직원 인증 완료! 관리 탭이 활성화되었습니다.');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0', padding: '0', background: '#FFFFFF', minHeight: '100%' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '14px 16px', borderBottom: '1px solid #F1F5F9', position: 'relative' }}>
        <span style={{ fontWeight: 800, fontSize: '1rem', color: '#0F172A' }}>내 프로필</span>
      </div>

      {/* 프로필 카드 상단 */}
      <div style={{ background: '#FFFFFF', padding: '32px 20px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
        <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: '#E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <i className="bi bi-person-fill" style={{ fontSize: '2.2rem', color: '#94A3B8' }}></i>
        </div>
        <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>{emailId}</div>
        <div style={{ fontSize: '0.82rem', color: '#64748B' }}>{user?.schoolName || '국립군산대학교'}</div>
        <div style={{ marginTop: '4px', padding: '4px 14px', borderRadius: '9999px', border: '1px solid #E2E8F0', fontSize: '0.78rem', fontWeight: 600, color: '#475569', background: '#FFFFFF' }}>
          {isAdmin ? '교직원 (시설관리자)' : '학생 (익명 보호 중)'}
        </div>
      </div>

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
    </div>
  );
}

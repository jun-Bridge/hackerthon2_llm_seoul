import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { useToast } from '../components/common/Toast';
import PageHeader from '../components/common/PageHeader';
import { logout, submitAdminCode } from '../api/auth';

export default function ProfilePage({ onBack }) {
  const { user, setUser } = useApp();
  const { showToast } = useToast();
  const [adminCode, setAdminCode] = useState('');
  const [busy, setBusy] = useState(false);
  const isAdmin = user?.role === 'admin';

  const handleLogout = async () => {
    try { await logout(); } catch { /* 세션이 이미 없어도 진행 */ }
    setUser(null);   // 프론트 상태 초기화 → App이 로그인 화면으로
  };

  // 교직원 인증: 코드를 서버가 그 학교 admin_codes와 대조한다.
  // 맞으면 역할이 admin으로 바뀌고 세션도 새 role로 재발급된다.
  const handleAdminVerify = async () => {
    if (busy) return;
    if (!adminCode.trim()) {
      showToast('관리자 코드를 입력해 주세요.');
      return;
    }
    setBusy(true);
    try {
      const me = await submitAdminCode(adminCode.trim());
      setUser(me);              // 갱신된 role로 화면이 관리자 모드로 바뀐다
      setAdminCode('');
      showToast('교직원 인증이 완료되었습니다.');
    } catch (e) {
      showToast(e?.message || '인증에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const row = { display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
  const label = { fontSize: '0.88rem', fontWeight: 600, color: '#0F172A' };
  const value = { fontSize: '0.88rem', fontWeight: 700, color: '#0F172A' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minHeight: '100%', background: '#FFFFFF', paddingBottom: '88px' }}>
      <PageHeader title="프로필" onBack={onBack} />

      {/* 프로필 아바타 섹션 */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '20px 16px 12px' }}>
        <div style={{ width: '80px', height: '80px', borderRadius: '50%', border: '2px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FFFFFF', overflow: 'hidden' }}>
          <img src="/dadumi-face-brave.png" alt="프로필" style={{ width: '60px', height: '60px', objectFit: 'contain' }} />
        </div>
        <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0F172A' }}>{user?.email?.split('@')[0] || 'student'}</div>
        <div style={{ fontSize: '0.85rem', color: '#64748B' }}>{user?.school_name || ''}</div>
        <span style={{ padding: '4px 14px', borderRadius: '9999px', background: '#F1F5F9', fontSize: '0.78rem', fontWeight: 600, color: '#475569' }}>
          {isAdmin ? '교직원' : '학생'}
        </span>
      </div>

      {/* 계정 정보 — 값은 전부 GET /auth/me 응답(Me)에서 온다 */}
      <div style={{ margin: '0 16px', border: '1px solid #E2E8F0', borderRadius: '14px', overflow: 'hidden', background: '#FFFFFF' }}>
        <div style={{ padding: '14px 18px', borderBottom: isAdmin ? 'none' : '1px solid #F1F5F9' }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#94A3B8', marginBottom: '12px' }}>계정 정보</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={row}>
              <span style={label}>이메일</span>
              <span style={value}>{user?.email}</span>
            </div>
            <div style={row}>
              <span style={label}>비밀번호</span>
              <span style={{ ...value, letterSpacing: '2px', fontWeight: 400 }}>••••••••</span>
            </div>
            <div style={row}>
              <span style={label}>소속 캠퍼스</span>
              {/* 백엔드 필드명은 school_name (schoolName 아님) */}
              <span style={value}>{user?.school_name}</span>
            </div>
            <div style={row}>
              <span style={label}>역할</span>
              <span style={{ ...value, color: '#2563EB' }}>{isAdmin ? '교직원' : '학생'}</span>
            </div>
          </div>
        </div>

        {/* 교직원 인증 — 이미 관리자면 보여줄 이유가 없다 */}
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
                onKeyDown={(e) => e.key === 'Enter' && handleAdminVerify()}
                placeholder="교직원 관리자 코드 입력"
                style={{ flex: 1, padding: '10px 14px', border: '1px solid #E2E8F0', borderRadius: '10px', fontSize: '0.85rem', outline: 'none', color: '#0F172A' }}
              />
              <button
                onClick={handleAdminVerify}
                disabled={busy}
                style={{ padding: '10px 16px', borderRadius: '10px', background: busy ? '#94A3B8' : '#0F172A', color: '#FFFFFF', fontSize: '0.82rem', fontWeight: 700, border: 'none', cursor: busy ? 'default' : 'pointer', whiteSpace: 'nowrap' }}
              >
                인증하기
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 로그아웃 */}
      <div
        onClick={handleLogout}
        style={{ margin: '0 16px', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <i className="bi bi-box-arrow-left" style={{ color: '#EF4444', fontSize: '1rem' }}></i>
          <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#EF4444' }}>로그아웃</span>
        </div>
        <i className="bi bi-chevron-right" style={{ color: '#CBD5E1' }}></i>
      </div>
    </div>
  );
}

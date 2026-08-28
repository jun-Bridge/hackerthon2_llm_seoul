import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { schoolDatabase } from '../store/schools';
import '../styles/auth.css';

export default function AuthPage({ onBack, onLoginSuccess }) {
  const { setUser } = useApp();
  const [tab, setTab] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [schoolSearch, setSchoolSearch] = useState('');
  const [selectedSchool, setSelectedSchool] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isStaff, setIsStaff] = useState(false);
  const [adminCode, setAdminCode] = useState('');
  const [showPw, setShowPw] = useState(false);

  const filteredSchools = schoolSearch.trim()
    ? schoolDatabase.filter(s =>
        s.name.includes(schoolSearch) || s.domain.includes(schoolSearch) || s.aliases.some(a => a.includes(schoolSearch))
      ).slice(0, 8)
    : [];

  const handleSchoolSelect = (school) => {
    setSelectedSchool(school);
    setSchoolSearch(school.name);
    setShowDropdown(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const domain = selectedSchool?.domain || 'kunsan.ac.kr';
    const fullEmail = tab === 'login' ? email : `${email}@${domain}`;
    const role = isStaff && adminCode ? 'staff' : 'student';
    setUser({ email: fullEmail, role, schoolDomain: domain, schoolName: selectedSchool?.name || '국립군산대학교' });
    onLoginSuccess();
  };

  return (
    <div className="auth-screen">
      <div className="auth-back-row">
        <button className="btn-icon" onClick={onBack}><i className="bi bi-arrow-left"></i></button>
      </div>
      <div className="auth-body">
        <div className="auth-logo-row">
          <svg width="36" height="36" viewBox="0 0 28 28" fill="none">
            <path d="M4 14C4 8.48 8.48 4 14 4C19.52 4 24 8.48 24 14C24 19.52 19.52 24 14 24" stroke="#2563EB" strokeWidth="3" strokeLinecap="round"/>
            <path d="M4 4V24" stroke="#2563EB" strokeWidth="3" strokeLinecap="round"/>
            <path d="M4 14H8" stroke="#2563EB" strokeWidth="3" strokeLinecap="round"/>
          </svg>
          <span className="auth-brand">다듬이</span>
        </div>
        <span className="auth-subtitle">캠퍼스 시설 민원 도우미</span>

        <div className="auth-tabs">
          <button className={`auth-tab ${tab === 'login' ? 'active' : ''}`} onClick={() => setTab('login')}>로그인</button>
          <button className={`auth-tab ${tab === 'signup' ? 'active' : ''}`} onClick={() => setTab('signup')}>회원가입</button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {tab === 'signup' && (
            <div className="auth-search-field">
              <i className="bi bi-search"></i>
              <input type="text" placeholder="소속 대학교 검색" value={schoolSearch}
                onChange={(e) => { setSchoolSearch(e.target.value); setShowDropdown(true); }}
                onFocus={() => setShowDropdown(true)} />
              {showDropdown && filteredSchools.length > 0 && (
                <div className="school-dropdown">
                  {filteredSchools.map(s => (
                    <div key={s.domain} className="school-item" onClick={() => handleSchoolSelect(s)}>
                      <span>{s.name}</span>
                      <span className="school-domain">@{s.domain}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="auth-input-card">
            <input type={tab === 'login' ? 'email' : 'text'}
              placeholder={tab === 'login' ? '이메일을 입력하세요' : '아이디 입력'}
              value={email} onChange={(e) => setEmail(e.target.value)} required />
            {tab === 'signup' && selectedSchool && <span className="domain-suffix">@{selectedSchool.domain}</span>}
          </div>

          <div className="auth-input-card">
            <input type={showPw ? 'text' : 'password'} placeholder="비밀번호를 입력하세요"
              value={password} onChange={(e) => setPassword(e.target.value)} required />
            <i className={`bi bi-eye${showPw ? '-slash' : ''}`} onClick={() => setShowPw(!showPw)} style={{ cursor: 'pointer', color: '#94A3B8' }}></i>
          </div>

          {tab === 'signup' && (
            <>
              <label className="staff-check">
                <input type="checkbox" checked={isStaff} onChange={(e) => setIsStaff(e.target.checked)} />
                <span>교직원으로 가입</span>
              </label>
              {isStaff && (
                <div className="auth-input-card">
                  <input type="text" placeholder="관리자 코드 입력" value={adminCode} onChange={(e) => setAdminCode(e.target.value)} />
                </div>
              )}
            </>
          )}

          <button type="submit" className="btn-primary-full">{tab === 'login' ? '로그인' : '가입하기'}</button>
        </form>

        <div className="auth-footer-link">
          <span onClick={() => alert('비밀번호 재설정 링크가 학교 이메일로 전송됩니다.')}>비밀번호 찾기</span>
        </div>
      </div>
    </div>
  );
}

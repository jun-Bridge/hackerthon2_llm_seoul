import { useState, useEffect } from 'react';

// 가짜 민원 데이터 (슉슉 바뀌는 애니메이션용)
const fakePosts = [
  { title: '강의실 에어컨이 시원하지 않아요', location: '공학관 3층', category: '냉난방 / 공조' },
  { title: '화장실 세면대에서 물이 새요', location: '학생회관 2층', category: '위생 / 배관' },
  { title: '프로젝터 화면이 자주 꺼져요', location: '인문관 B102호', category: '영상 / 기자재' },
  { title: '도서관 열람실 조명이 너무 어두워요', location: '중앙도서관 4층', category: '전기 / 설비' },
  { title: '열람실 자리 배치가 불편해요', location: '중앙도서관 3열람실', category: '공간 / 편의' },
  { title: '콘센트가 작동하지 않아요', location: '도서관 2층', category: '전기 / 설비' },
  { title: '출입문 자동문이 고장났어요', location: '학생회관 정문', category: '안전 / 보안' },
  { title: '와이파이 연결이 불안정해요', location: '공학관 5층', category: '통신 / 인터넷' },
];

export default function LandingPage({ onLogin }) {
  const [visiblePosts, setVisiblePosts] = useState(fakePosts.slice(0, 4));
  const [fadeKey, setFadeKey] = useState(0);

  // 3초마다 리스트를 슉슉 교체
  useEffect(() => {
    const interval = setInterval(() => {
      const shuffled = [...fakePosts].sort(() => Math.random() - 0.5);
      setVisiblePosts(shuffled.slice(0, 4));
      setFadeKey(k => k + 1);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleAction = () => {
    onLogin();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'linear-gradient(180deg, #BFDBFE 0%, #DBEAFE 15%, #EFF6FF 32%, #F8FAFC 52%, #FFFFFF 100%)', overflow: 'hidden' }}>

      {/* 상단: 다듬이 캐릭터 + 인사 */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 20px 16px' }}>
        <img src="/cheer.png" alt="다듬이" style={{ width: '100px', height: '100px', objectFit: 'contain', marginBottom: '12px' }} />
        <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0F172A', textAlign: 'center' }}>
          캠퍼스 불편, 다듬이가<br/>깔끔하게 정리해드려요
        </div>
        <div style={{ fontSize: '0.82rem', color: '#64748B', marginTop: '6px', textAlign: 'center' }}>
          AI가 민원을 공문서로 변환 · 100% 익명 보장
        </div>
      </div>

      {/* 가짜 민원 리스트 (슉슉 바뀜) */}
      <div style={{ flex: 1, padding: '0 16px', overflow: 'hidden' }}>
        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#475569', marginBottom: '10px' }}>실시간 접수 민원</div>
        <div key={fadeKey} style={{ display: 'flex', flexDirection: 'column', gap: '0', animation: 'fadeSlide 0.4s ease' }}>
          {visiblePosts.map((p, i) => (
            <div key={i} onClick={handleAction} style={{ padding: '14px 4px', borderBottom: '1px solid #F1F5F9', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '3px' }}>
                  <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#2563EB', background: '#EFF6FF', padding: '1px 6px', borderRadius: '9999px' }}>{p.category}</span>
                </div>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0F172A', lineHeight: '1.35' }}>{p.title}</div>
                <div style={{ fontSize: '0.75rem', color: '#94A3B8', marginTop: '2px' }}>{p.location} · 익명</div>
              </div>
              <i className="bi bi-chevron-right" style={{ color: '#D1D5DB' }}></i>
            </div>
          ))}
        </div>
      </div>

      {/* 하단: 로그인/가입 버튼 */}
      <div style={{ padding: '16px 20px 24px', display: 'flex', flexDirection: 'column', gap: '8px', background: '#FFFFFF', borderTop: '1px solid #F1F5F9' }}>
        <button onClick={onLogin} style={{ width: '100%', height: '48px', borderRadius: '12px', background: '#2563EB', color: '#FFF', fontSize: '0.95rem', fontWeight: 700, border: 'none', cursor: 'pointer', boxShadow: '0 4px 14px rgba(37,99,235,0.2)' }}>
          로그인 / 회원가입
        </button>
        <div style={{ textAlign: 'center', fontSize: '0.78rem', color: '#94A3B8' }}>학교 이메일로 간편 가입</div>
      </div>
    </div>
  );
}

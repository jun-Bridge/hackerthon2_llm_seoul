// 접수 완료 모달 (시안: 파란 체크 아이콘 + 텍스트 + 확인 버튼)
export default function SubmitSuccessModal({ onConfirm }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
      zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
    }}>
      <div style={{
        background: '#FFFFFF', borderRadius: '18px', padding: '32px 24px',
        textAlign: 'center', maxWidth: '300px', width: '100%',
        boxShadow: '0 20px 40px rgba(0,0,0,0.12)'
      }}>
        <div style={{
          width: '56px', height: '56px', borderRadius: '50%',
          background: '#2563EB', color: '#fff', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px', fontSize: '1.6rem'
        }}>
          <i className="bi bi-check-lg"></i>
        </div>
        <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F172A', marginBottom: '16px' }}>
          익명 민원이 접수되었어요
        </div>
        <button onClick={onConfirm} style={{
          width: '100%', height: '44px', borderRadius: '9999px',
          background: '#2563EB', color: '#fff', fontSize: '0.9rem',
          fontWeight: 700, border: 'none', cursor: 'pointer'
        }}>
          확인
        </button>
      </div>
    </div>
  );
}

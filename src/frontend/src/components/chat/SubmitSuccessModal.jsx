// 접수 완료 모달 (파란 체크 아이콘 + 텍스트 + 확인/현황 보기 버튼)
export default function SubmitSuccessModal({ onConfirm, onGoStatus }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)',
      zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
    }}>
      <div style={{
        background: '#FFFFFF', borderRadius: '18px', padding: '32px 24px',
        textAlign: 'center', maxWidth: '300px', width: '100%',
        boxShadow: '0 20px 40px rgba(0,0,0,0.12)'
      }}>
        <div style={{
          width: '80px', height: '80px',
          margin: '0 auto 16px',
        }}>
          <img src="/heart.png" alt="다듬이" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>
        <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F172A', marginBottom: '6px' }}>
          익명 민원이 접수되었어요
        </div>
        <div style={{ fontSize: '0.8rem', color: '#94A3B8', marginBottom: '20px' }}>
          접수 현황에서 처리 상태를 확인할 수 있어요
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button onClick={onGoStatus || onConfirm} style={{
            width: '100%', height: '44px', borderRadius: '9999px',
            background: '#2563EB', color: '#fff', fontSize: '0.9rem',
            fontWeight: 700, border: 'none', cursor: 'pointer'
          }}>
            접수 현황 보기
          </button>
          <button onClick={onConfirm} style={{
            width: '100%', height: '44px', borderRadius: '9999px',
            background: '#F1F5F9', color: '#475569', fontSize: '0.9rem',
            fontWeight: 700, border: 'none', cursor: 'pointer'
          }}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

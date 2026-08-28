// 서브 페이지 헤더 (← + 중앙 타이틀)
export default function PageHeader({ title, onBack }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '14px 16px', borderBottom: '1px solid #F1F5F9',
      background: '#FFFFFF', position: 'relative', flexShrink: 0
    }}>
      {onBack && (
        <button onClick={onBack} style={{
          position: 'absolute', left: '16px', background: 'none', border: 'none',
          fontSize: '1.2rem', color: '#0F172A', cursor: 'pointer', display: 'flex', alignItems: 'center'
        }}>
          <i className="bi bi-chevron-left"></i>
        </button>
      )}
      <span style={{ fontWeight: 800, fontSize: '1rem', color: '#0F172A' }}>{title}</span>
    </div>
  );
}

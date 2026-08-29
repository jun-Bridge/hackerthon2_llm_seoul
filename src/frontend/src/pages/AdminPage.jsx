import { useState } from 'react';
import { useApp } from '../store/AppContext';
import { formatDate } from '../store/constants';
import {
  openComplaint, acceptComplaint, resolveComplaint, holdComplaint, rejectComplaint, addComment,
} from '../api/admin';
import AdminComplaintDetail from '../components/common/AdminComplaintDetail';
import PageHeader from '../components/common/PageHeader';

export default function AdminPage({ onBack }) {
  const { complaints, stats, refreshStats, replaceComplaint, removeComplaint } = useApp();
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState("전체");

  // 통계는 백엔드 /admin/stats가 정본. 아직 못 받았으면 목록으로 임시 계산.
  const by = stats?.by_status || {};
  const total = stats?.total ?? complaints.length;
  const proc = by['처리중'] ?? complaints.filter(c => c.status === '처리중').length;
  const done = by['해결완료'] ?? complaints.filter(c => c.status === '해결완료').length;
  const hold = (by['보류'] ?? complaints.filter(c => c.status === '보류').length)
             + (by['거절'] ?? complaints.filter(c => c.status === '거절').length);

  // 행 클릭 = 상세 열기. '미확인→확인'은 openComplaint(POST)로 서버가 전이시킨다.
  const handleOpen = async (id) => {
    setSelectedId(id);
    try {
      const updated = await openComplaint(id);
      replaceComplaint(updated);
      refreshStats().catch(() => {});
    } catch {
      // 서버 없거나 이미 확인 상태면 무시
    }
  };

  // 상태 전이 — 상태에 맞는 API 호출
  // 상세 모달이 코멘트 입력값을 세 번째 인자로 넘겨준다. 거기 적었으면 그것을 사유로 쓰고,
  // 비어 있을 때만 prompt로 되묻는다 — 적어놓고도 또 물어보면 두 번 쓰게 된다.
  const handleStatusChange = async (id, newStatus, typedReason = "") => {
    try {
      let updated;
      const askReason = (label) => {
        const r = (typedReason || "").trim();
        return r || (window.prompt(`${label} 사유를 입력하세요 (필수)`) || "").trim();
      };
      if (newStatus === "처리중") updated = await acceptComplaint(id);
      else if (newStatus === "해결완료") updated = await resolveComplaint(id);
      else if (newStatus === "보류") {
        const reason = askReason("보류");
        if (!reason) return;
        updated = await holdComplaint(id, reason);
      } else if (newStatus === "거절") {
        const reason = askReason("거절");
        if (!reason) return;
        updated = await rejectComplaint(id, reason);
      }
      if (updated) {
        replaceComplaint(updated);
        refreshStats().catch(() => {});
      }
      setSelectedId(null);
    } catch (e) {
      alert(e?.message || "처리에 실패했습니다.");
    }
  };

  // 코멘트 추가 — 실제 API
  const handleAddComment = async (id, content) => {
    try {
      const updated = await addComment(id, content);
      replaceComplaint(updated);
    } catch (e) {
      alert(e?.message || "코멘트 추가에 실패했습니다.");
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', background: '#FFFFFF', paddingBottom: '88px' }}>
      <PageHeader title="관리자 페이지" onBack={onBack} />
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* 통계 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden', background: '#FFFFFF' }}>
        {[
          { l: '전체', v: total },
          { l: '처리중', v: proc },
          { l: '해결완료', v: done },
          { l: '보류/거절', v: hold }
        ].map((s, i) => (
          <div key={i} style={{ padding: '12px 6px', textAlign: 'center', borderRight: i < 3 ? '1px solid #F1F5F9' : 'none' }}>
            <div style={{ fontSize: '0.7rem', color: '#94A3B8', fontWeight: 600, marginBottom: '2px' }}>{s.l}</div>
            <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#0F172A' }}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* 목록 */}
      <div>
        <div style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '12px' }}>민원 목록</div>

        {/* 상태 필터 */}
        <div className="cat-chip-row" style={{ display: 'flex', gap: '6px', overflowX: 'auto', scrollbarWidth: 'none', marginBottom: '14px' }}>
          {["전체", "미확인", "확인", "처리중", "해결완료", "보류", "거절"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '7px 14px',
                borderRadius: '9999px',
                border: filter === f ? '1.5px solid #2563EB' : '1px solid #E2E8F0',
                background: filter === f ? '#EFF6FF' : '#FFFFFF',
                color: filter === f ? '#2563EB' : '#475569',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
                flexShrink: 0,
                whiteSpace: 'nowrap',
              }}
            >
              {f}
            </button>
          ))}
        </div>

        {(() => {
          const filtered = filter === "전체" ? complaints : complaints.filter(c => c.status === filter);
          return filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <img src="/dadumi-face-hmm.png" alt="다듬이" style={{ width: '72px', height: '72px', objectFit: 'contain', opacity: 0.9 }} />
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#475569' }}>해당 상태의 민원이 없습니다</div>
          </div>
        ) : filtered.map(c => (
          <div key={c.id} className="list-item-touch" onClick={() => handleOpen(c.id)} style={{ padding: '16px 2px', borderBottom: '1px solid #F1F5F9', display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer' }}>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#2563EB', background: '#EFF6FF', padding: '2px 8px', borderRadius: '9999px' }}>{c.category}</span>
                <span className={`status-pill status-${c.status}`}>{c.status}</span>
              </div>
              <span style={{ fontSize: '0.92rem', fontWeight: 700, color: '#0F172A' }}>{c.title}</span>
              <span style={{ fontSize: '0.78rem', color: '#94A3B8' }}>{c.location} · {formatDate(c.created_at)}</span>
            </div>
            <i className="bi bi-chevron-right" style={{ color: '#D1D5DB' }}></i>
          </div>
        ));
        })()}
      </div>

      {/* 관리자 상세 */}
      {selectedId != null && (() => {
        const sel = complaints.find(c => c.id === selectedId);
        return sel ? (
          <AdminComplaintDetail
            complaint={sel}
            onClose={() => setSelectedId(null)}
            onStatusChange={handleStatusChange}
            onAddComment={handleAddComment}
          />
        ) : null;
      })()}
      </div>
    </div>
  );
}

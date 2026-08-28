import { useState, useEffect } from 'react';
import { getComplaint, getComplaintConversation, withdrawComplaint } from '../../api/board';
import {
  openComplaint, acceptComplaint, resolveComplaint, holdComplaint, rejectComplaint, addComment,
} from '../../api/admin';
import { verifyPassword } from '../../api/auth';
import { ApiError } from '../../api/client';
import { formatDate } from '../../store/constants';

// 민원 상세 모달. 학생/관리자 공용.
// - isAdmin=true면 열 때 openComplaint(POST, 미확인→확인 자동전환) + 상태전이 버튼·코멘트
// - 학생이면 getComplaint(조회만) + 본인 글이면 철회(3단계)
export default function ComplaintDetailModal({ complaintId, isAdmin, onClose, onChanged }) {
  const [detail, setDetail] = useState(null);
  const [conversation, setConversation] = useState(null);
  const [showConv, setShowConv] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = async () => {
    try {
      // 관리자는 open(확인 자동전환), 학생은 단순 조회
      const d = isAdmin ? await openComplaint(complaintId) : await getComplaint(complaintId);
      setDetail(d);
      if (isAdmin) onChanged?.(d);   // 미확인→확인 반영
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '불러오지 못했습니다.');
    }
  };
  useEffect(() => { load(); /* eslint-disable-line */ }, [complaintId]);

  const doAction = async (fn) => {
    setBusy(true); setErr('');
    try {
      const updated = await fn();
      setDetail(updated);
      onChanged?.(updated);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '처리에 실패했습니다.');
    } finally { setBusy(false); }
  };

  // 관리자 상태 전이
  const onAccept = () => doAction(() => acceptComplaint(complaintId));
  const onResolve = () => doAction(() => resolveComplaint(complaintId));
  const onHold = () => {
    const reason = window.prompt('보류 사유를 입력하세요 (필수)');
    if (reason == null) return;
    if (!reason.trim()) { alert('보류 사유는 필수입니다.'); return; }
    doAction(() => holdComplaint(complaintId, reason.trim()));
  };
  const onReject = () => {
    const reason = window.prompt('거절 사유를 입력하세요 (필수)');
    if (reason == null) return;
    if (!reason.trim()) { alert('거절 사유는 필수입니다.'); return; }
    doAction(() => rejectComplaint(complaintId, reason.trim()));
  };
  const onComment = () => {
    const content = window.prompt('코멘트를 입력하세요');
    if (content == null || !content.trim()) return;
    doAction(() => addComment(complaintId, content.trim()));
  };

  // 학생 철회 — 3단계: ① 비밀번호 확인 ② 최종 확인 ③ 실행
  const onWithdraw = async () => {
    const pw = window.prompt('철회하면 게시판·관리자 목록에서 즉시 사라지고 되돌릴 수 없습니다.\n계속하려면 비밀번호를 입력하세요.');
    if (pw == null || !pw) return;
    try {
      await verifyPassword(pw);   // 1단계: 본인 확인 (틀리면 여기서 막힘)
    } catch (e) {
      alert(e instanceof ApiError && e.code === 'WRONG_PASSWORD' ? '비밀번호가 일치하지 않습니다.' : '확인에 실패했습니다.');
      return;
    }
    if (!window.confirm('정말 철회하시겠습니까? 이 동작은 되돌릴 수 없습니다.')) return;  // 2단계
    setBusy(true);
    try {
      await withdrawComplaint(complaintId, pw);   // 3단계: 실행
      alert('철회되었습니다.');
      onChanged?.({ id: complaintId, __withdrawn: true });
      onClose();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '철회에 실패했습니다.');
    } finally { setBusy(false); }
  };

  const loadConv = async () => {
    if (conversation) { setShowConv(!showConv); return; }
    try {
      const rows = await getComplaintConversation(complaintId);
      setConversation(rows); setShowConv(true);
    } catch { setErr('원문을 불러오지 못했습니다.'); }
  };

  const st = detail?.status;
  const box = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 210, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' };
  const sheet = { background: '#FFF', width: '100%', maxWidth: '480px', maxHeight: '88vh', overflowY: 'auto', borderRadius: '18px 18px 0 0', padding: '20px' };
  const btn = (bg) => ({ flex: 1, padding: '11px', borderRadius: '10px', background: bg, color: '#FFF', border: 'none', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' });

  return (
    <div style={box} onClick={onClose}>
      <div style={sheet} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <span style={{ fontWeight: 800 }}>민원 상세</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.1rem', cursor: 'pointer' }}><i className="bi bi-x-lg"></i></button>
        </div>

        {!detail ? <div style={{ padding: '2rem', textAlign: 'center', color: '#94A3B8' }}>{err || '불러오는 중…'}</div> : (
          <>
            <span className={`status-pill status-${st}`}>{st}</span>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: '8px 0' }}>{detail.title}</h3>
            <div style={{ fontSize: '0.8rem', color: '#94A3B8', marginBottom: '10px' }}>{detail.category} · {detail.location} · {formatDate(detail.created_at)}</div>
            <p style={{ fontSize: '0.88rem', color: '#334155', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{detail.body}</p>

            {/* 코멘트 */}
            {detail.comments?.length > 0 && (
              <div style={{ marginTop: '14px', borderTop: '1px solid #F1F5F9', paddingTop: '10px' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '6px' }}>관리자 코멘트</div>
                {detail.comments.map(c => (
                  <div key={c.id} style={{ fontSize: '0.82rem', color: '#475569', padding: '6px 0' }}>
                    {c.is_hold_reason && <span style={{ color: '#D97706', fontWeight: 700 }}>[보류 사유] </span>}{c.content}
                  </div>
                ))}
              </div>
            )}

            <button onClick={loadConv} style={{ marginTop: '12px', width: '100%', padding: '9px', borderRadius: '9px', background: '#F1F5F9', border: 'none', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer' }}>
              {showConv ? '원문 접기' : '학생 원문 보기'}
            </button>
            {showConv && conversation && (
              <div style={{ marginTop: '8px', background: '#F8FAFC', borderRadius: '10px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {conversation.map((t, i) => (
                  <div key={i} style={{ fontSize: '0.8rem', color: t.role === 'student' ? '#0F172A' : '#2563EB' }}>
                    <b>{t.role === 'student' ? '학생' : 'AI'}:</b> {t.content}
                  </div>
                ))}
              </div>
            )}

            {err && <div style={{ color: '#B91C1C', fontSize: '0.8rem', marginTop: '10px' }}>{err}</div>}

            {/* 관리자 상태 전이 버튼 (상태별 노출) */}
            {isAdmin && (
              <div style={{ display: 'flex', gap: '8px', marginTop: '14px', flexWrap: 'wrap' }}>
                {st === '확인' && <>
                  <button style={btn('#2563EB')} disabled={busy} onClick={onAccept}>수락(처리중)</button>
                  <button style={btn('#D97706')} disabled={busy} onClick={onHold}>보류</button>
                  <button style={btn('#DC2626')} disabled={busy} onClick={onReject}>거절</button>
                </>}
                {/* 처리중·보류 모두 완료 버튼으로 해결완료로 전이 */}
                {(st === '처리중' || st === '보류') && <button style={btn('#16A34A')} disabled={busy} onClick={onResolve}>해결 완료</button>}
                <button style={{ ...btn('#475569'), flex: '0 0 100%' }} disabled={busy} onClick={onComment}>코멘트 추가</button>
              </div>
            )}

            {/* 학생 철회 (본인 글만) */}
            {!isAdmin && detail.is_mine && (
              <button style={{ ...btn('#DC2626'), width: '100%', marginTop: '14px' }} disabled={busy} onClick={onWithdraw}>민원 철회</button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

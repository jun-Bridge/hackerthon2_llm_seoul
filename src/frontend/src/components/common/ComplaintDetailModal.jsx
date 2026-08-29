import { useState, useEffect } from 'react';
import { getComplaint, getComplaintConversation, withdrawComplaint } from '../../api/board';
import {
  openComplaint, acceptComplaint, resolveComplaint, holdComplaint, rejectComplaint, addComment,
} from '../../api/admin';
import { verifyPassword } from '../../api/auth';
import { ApiError } from '../../api/client';
import { formatDate } from '../../store/constants';

// 민원 상세 — 전체 페이지 형태. 게시판/현황 위에 덮어서 보여준다.
export default function ComplaintDetailModal({ complaintId, isAdmin, onClose, onChanged }) {
  const [detail, setDetail] = useState(null);
  const [conversation, setConversation] = useState(null);
  const [showConv, setShowConv] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = async () => {
    try {
      const d = isAdmin ? await openComplaint(complaintId) : await getComplaint(complaintId);
      setDetail(d);
      if (isAdmin) onChanged?.(d);
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

  const onWithdraw = async () => {
    const pw = window.prompt('철회하면 게시판·관리자 목록에서 즉시 사라지고 되돌릴 수 없습니다.\n계속하려면 비밀번호를 입력하세요.');
    if (pw == null || !pw) return;
    try {
      await verifyPassword(pw);
    } catch (e) {
      alert(e instanceof ApiError && e.code === 'WRONG_PASSWORD' ? '비밀번호가 일치하지 않습니다.' : '확인에 실패했습니다.');
      return;
    }
    if (!window.confirm('정말 철회하시겠습니까? 이 동작은 되돌릴 수 없습니다.')) return;
    setBusy(true);
    try {
      await withdrawComplaint(complaintId, pw);
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

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 210,
      background: 'linear-gradient(180deg, #eff6ff 0%, #f8fafc 28%, #ffffff 100%)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* 헤더 — 게시판 PageHeader와 동일한 톤 */}
      <div style={{
        height: '56px', padding: '0 16px', display: 'flex', alignItems: 'center',
        justifyContent: 'center', borderBottom: '1px solid #F1F5F9', position: 'sticky', top: 0, zIndex: 20, flexShrink: 0,
      }}>
        <button
          onClick={onClose}
          style={{ position: 'absolute', left: '16px', background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#0F172A' }}
        >
          <i className="bi bi-chevron-left"></i>
        </button>
        <span style={{ fontSize: '1rem', fontWeight: 800, color: '#0F172A' }}>민원 상세</span>
      </div>

      {/* 본문 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 24px' }}>
        {!detail ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: '#94A3B8' }}>{err || '불러오는 중…'}</div>
        ) : (
          <>
            {/* 상태 + 카테고리 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <span className={`status-pill status-${st}`}>{st}</span>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#2563EB', background: '#EFF6FF', padding: '2px 8px', borderRadius: '9999px' }}>{detail.category}</span>
            </div>

            {/* 제목 */}
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0F172A', margin: '0 0 12px', lineHeight: 1.4 }}>{detail.title}</h3>

            {/* 메타 정보 카드 */}
            <div style={{ background: '#F8FAFC', borderRadius: '12px', padding: '14px 16px', marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', gap: '12px', fontSize: '0.84rem' }}>
                <span style={{ color: '#64748B', fontWeight: 600, minWidth: '42px' }}>위치</span>
                <span style={{ color: '#0F172A', fontWeight: 600 }}>{detail.location}</span>
              </div>
              <div style={{ display: 'flex', gap: '12px', fontSize: '0.84rem' }}>
                <span style={{ color: '#64748B', fontWeight: 600, minWidth: '42px' }}>접수일</span>
                <span style={{ color: '#0F172A', fontWeight: 600 }}>{formatDate(detail.created_at)}</span>
              </div>
            </div>

            {/* 민원 내용 */}
            <div style={{ background: '#F8FAFC', borderRadius: '12px', padding: '14px 16px', marginBottom: '12px' }}>
              <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0F172A', marginBottom: '6px' }}>민원 내용</div>
              <p style={{ fontSize: '0.86rem', color: '#334155', whiteSpace: 'pre-wrap', lineHeight: 1.6, margin: 0 }}>{detail.body}</p>
            </div>

            {/* 코멘트 */}
            {detail.comments?.length > 0 && (
              <div style={{ background: '#F8FAFC', borderRadius: '12px', padding: '14px 16px', marginBottom: '12px' }}>
                <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0F172A', marginBottom: '8px' }}>관리자 코멘트</div>
                {detail.comments.map(c => (
                  <div key={c.id} style={{ fontSize: '0.82rem', color: '#475569', padding: '4px 0' }}>
                    {c.is_hold_reason && <span style={{ color: '#D97706', fontWeight: 700 }}>[보류 사유] </span>}{c.content}
                  </div>
                ))}
              </div>
            )}

            {/* 원문 보기 */}
            <button onClick={loadConv} style={{ width: '100%', padding: '10px', borderRadius: '10px', background: '#F1F5F9', border: 'none', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', color: '#475569', marginBottom: '12px' }}>
              {showConv ? '원문 접기' : '학생 원문 보기'}
            </button>
            {showConv && conversation && (
              <div style={{ background: '#F8FAFC', borderRadius: '10px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                {conversation.map((t, i) => (
                  <div key={i} style={{ fontSize: '0.8rem', color: t.role === 'student' ? '#0F172A' : '#2563EB' }}>
                    <b>{t.role === 'student' ? '학생' : 'AI'}:</b> {t.content}
                  </div>
                ))}
              </div>
            )}

            {err && <div style={{ color: '#B91C1C', fontSize: '0.8rem', marginBottom: '10px' }}>{err}</div>}

            {/* 관리자 상태 전이 버튼 */}
            {isAdmin && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {st === '확인' && <>
                  <button style={actionBtn('#2563EB')} disabled={busy} onClick={onAccept}>수락(처리중)</button>
                  <button style={actionBtn('#D97706')} disabled={busy} onClick={onHold}>보류</button>
                  <button style={actionBtn('#DC2626')} disabled={busy} onClick={onReject}>거절</button>
                </>}
                {(st === '처리중' || st === '보류') && <button style={actionBtn('#16A34A')} disabled={busy} onClick={onResolve}>해결 완료</button>}
                <button style={{ ...actionBtn('#475569'), flex: '0 0 100%' }} disabled={busy} onClick={onComment}>코멘트 추가</button>
              </div>
            )}

            {/* 학생 철회 */}
            {!isAdmin && detail.is_mine && (
              <button style={{ ...actionBtn('#DC2626'), width: '100%' }} disabled={busy} onClick={onWithdraw}>민원 철회</button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function actionBtn(bg) {
  return { flex: 1, padding: '12px', borderRadius: '10px', background: bg, color: '#FFF', border: 'none', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' };
}

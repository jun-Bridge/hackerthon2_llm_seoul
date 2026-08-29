import { useState, useEffect } from "react";
import { useApp } from "../store/AppContext";
import PageHeader from "../components/common/PageHeader";
import ComplaintDetail from "../components/common/ComplaintDetail";

const CATEGORIES = [
  "전체",
  "냉난방 / 공조",
  "위생 / 배관",
  "전기 / 설비",
  "영상 / 기자재",
  "공간 / 편의",
  "안전 / 보안",
  "통신 / 인터넷",
  "기타",
];

export default function BoardPage({
  initialSelectedComplaintId,
  onDetailClose,
  onBack,
}) {
  const { complaints } = useApp();
  // 데모 폴백 없음 — 목록이 비면 "민원이 없다"가 진실이다.
  const list = complaints;
  const [filter, setFilter] = useState("전체");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(
    initialSelectedComplaintId ?? null,
  );

  useEffect(() => {
    setSelectedId(initialSelectedComplaintId ?? null);
  }, [initialSelectedComplaintId]);
  const catFiltered =
    filter === "전체"
      ? list
      : filter === "기타"
        ? list.filter((c) => !CATEGORIES.slice(1, -1).includes(c.category))
        : list.filter((c) => c.category === filter);

  const filtered = catFiltered.filter(
    (c) =>
      !search ||
      (c.title || "").includes(search) ||
      (c.location || "").includes(search),
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100%",
        background: "#FFFFFF",
        paddingBottom: "88px",
      }}
    >
      <PageHeader title="민원게시판" onBack={onBack} />

      <div
        style={{
          padding: "0 0 16px",
          display: "flex",
          flexDirection: "column",
          gap: "14px",
        }}
      >
        {/* 안내 문구 — 은은한 파란 그라데이션 배경 */}
        <div
          style={{
            padding: "20px 16px 18px",
            background:
              "linear-gradient(135deg, #DBEAFE 0%, #EFF6FF 55%, #FFFFFF 100%)",
          }}
        >
          <div
            style={{
              fontSize: "0.98rem",
              fontWeight: 800,
              color: "#0F172A",
              marginBottom: "3px",
            }}
          >
            캠퍼스 시설 관련 민원을 확인해보세요
          </div>
          <div style={{ fontSize: "0.8rem", color: "#64748B" }}>
            익명으로 자유롭게 의견을 남겨주세요.
          </div>
        </div>

        {/* 카테고리 칩 — 가로 스크롤 한 줄 */}
        <div
          className="cat-chip-row"
          style={{
            display: "flex",
            gap: "6px",
            overflowX: "auto",
            padding: "0 16px",
            scrollbarWidth: "none",
          }}
        >
          {CATEGORIES.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: "7px 14px",
                borderRadius: "9999px",
                border:
                  filter === f ? "1.5px solid #2563EB" : "1px solid #E2E8F0",
                background: filter === f ? "#EFF6FF" : "#FFFFFF",
                color: filter === f ? "#2563EB" : "#475569",
                fontSize: "0.78rem",
                fontWeight: 600,
                cursor: "pointer",
                flexShrink: 0,
                whiteSpace: "nowrap",
              }}
            >
              {f}
            </button>
          ))}
        </div>

        {/* 검색 */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            background: "#F1F5F9",
            borderRadius: "9999px",
            padding: "8px 14px",
            margin: "0 16px",
          }}
        >
          <i
            className="bi bi-search"
            style={{ color: "#94A3B8", fontSize: "0.85rem" }}
          ></i>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="검색"
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: "0.85rem",
              color: "#0F172A",
            }}
          />
        </div>

        {/* 리스트 */}
        <div style={{ padding: "0 16px" }}>
          {filtered.length === 0 ? (
            <div
              style={{ textAlign: "center", padding: "3rem 1rem", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}
            >
              <img src="/dadumi-face-hmm.png" alt="다듬이" style={{ width: "72px", height: "72px", objectFit: "contain", opacity: 0.9 }} />
              <div style={{ fontSize: "0.9rem", fontWeight: 700, color: "#475569" }}>아직 등록된 민원이 없어요</div>
              <div style={{ fontSize: "0.8rem", color: "#94A3B8" }}>첫 민원을 남겨보세요</div>
            </div>
          ) : (
            filtered.map((c) => (
              <div
                key={c.id}
                className="list-item-touch"
                onClick={() => setSelectedId(c.id)}
                style={{
                  padding: "16px 4px",
                  borderBottom: "1px solid #F1F5F9",
                  display: "flex",
                  alignItems: "center",
                  cursor: "pointer",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      marginBottom: "4px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "0.7rem",
                        fontWeight: 600,
                        color: "#2563EB",
                        background: "#EFF6FF",
                        padding: "2px 8px",
                        borderRadius: "9999px",
                      }}
                    >
                      {c.category}
                    </span>
                    <span className={`status-pill status-${c.status}`}>
                      {c.status}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: "0.95rem",
                      fontWeight: 700,
                      color: "#0F172A",
                      marginBottom: "4px",
                      lineHeight: "1.4",
                    }}
                  >
                    {c.title}
                  </div>
                  <div style={{ fontSize: "0.78rem", color: "#94A3B8" }}>
                    {c.location} · {c.timestamp}
                  </div>
                </div>
                <i
                  className="bi bi-chevron-right"
                  style={{ color: "#D1D5DB", fontSize: "1rem" }}
                ></i>
              </div>
            ))
          )}
        </div>
      </div>

      {(() => {
        const sel = list.find((c) => c.id === selectedId);
        return sel ? (
          <ComplaintDetail
            complaint={sel}
            onClose={() => {
              setSelectedId(null);
              if (onDetailClose) onDetailClose();
            }}
            canWithdraw={!!sel?.is_mine}
          />
        ) : null;
      })()}
    </div>
  );
}

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
}) {
  const { complaints } = useApp();
  const list = complaints.length
    ? complaints
    : [
        {
          id: 1,
          title: "공학관 3층 에어컨이 작동하지 않아요",
          location: "공학관 3층",
          category: "냉난방 / 공조",
          status: "처리중",
          timestamp: "2026.08.20",
          is_mine: false,
        },
        {
          id: 2,
          title: "학생회관 화장실 세면대에서 물이 새고 있어요",
          location: "학생회관 2층",
          category: "위생 / 배관",
          status: "해결완료",
          timestamp: "2026.08.18",
          is_mine: true,
        },
        {
          id: 3,
          title: "중앙도서관 4층 조명이 너무 어두워요",
          location: "중앙도서관 4층",
          category: "전기 / 설비",
          status: "미확인",
          timestamp: "2026.08.17",
          is_mine: false,
        },
        {
          id: 4,
          title: "본관 자동문이 멈춰서 불편합니다",
          location: "본관 정문",
          category: "안전 / 보안",
          status: "처리중",
          timestamp: "2026.08.16",
          is_mine: false,
        },
        {
          id: 5,
          title: "실습실 와이파이가 자주 끊겨요",
          location: "공학관 5층",
          category: "통신 / 인터넷",
          status: "보류",
          timestamp: "2026.08.15",
          is_mine: false,
        },
      ];
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
        margin: "-10px -16px -80px",
        paddingBottom: "80px",
      }}
    >
      <PageHeader title="민원게시판" />

      <div
        style={{
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "14px",
        }}
      >
        <div>
          <div
            style={{
              fontSize: "0.95rem",
              fontWeight: 700,
              color: "#0F172A",
              marginBottom: "2px",
            }}
          >
            캠퍼스 시설 관련 민원을 확인해보세요
          </div>
          <div style={{ fontSize: "0.8rem", color: "#94A3B8" }}>
            익명으로 자유롭게 의견을 남겨주세요.
          </div>
        </div>

        {/* 카테고리 칩 */}
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
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
        <div>
          {filtered.length === 0 ? (
            <div
              style={{ textAlign: "center", padding: "3rem", color: "#94A3B8" }}
            >
              등록된 민원이 없습니다
            </div>
          ) : (
            filtered.map((c) => (
              <div
                key={c.id}
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
            canWithdraw={false}
          />
        ) : null;
      })()}
    </div>
  );
}

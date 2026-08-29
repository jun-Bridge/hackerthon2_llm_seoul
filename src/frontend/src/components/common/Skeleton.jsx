// 로딩 중 표시용 Skeleton 컴포넌트
export function SkeletonLine({ width = "100%", height = "14px", style = {} }) {
  return (
    <div
      className="skeleton"
      style={{ width, height, ...style }}
    />
  );
}

// 민원 리스트 아이템 Skeleton
export function SkeletonListItem() {
  return (
    <div style={{ padding: "16px 4px", borderBottom: "1px solid #F1F5F9", display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "flex", gap: "6px" }}>
        <div className="skeleton" style={{ width: "60px", height: "18px", borderRadius: "9999px" }} />
        <div className="skeleton" style={{ width: "48px", height: "18px", borderRadius: "9999px" }} />
      </div>
      <div className="skeleton" style={{ width: "80%", height: "16px" }} />
      <div className="skeleton" style={{ width: "50%", height: "12px" }} />
    </div>
  );
}

// 여러 줄 Skeleton
export function SkeletonList({ count = 4 }) {
  return (
    <div>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonListItem key={i} />
      ))}
    </div>
  );
}

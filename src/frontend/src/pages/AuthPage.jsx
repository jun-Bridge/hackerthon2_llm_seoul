import { useState, useEffect } from "react";
import { useApp } from "../store/AppContext";
import { listSchools, signup, login, getMe } from "../api/auth";
import { ApiError } from "../api/client";
import "../styles/auth.css";

// 에러 코드 → 사용자에게 보일 문구. 서버 message가 있으면 그걸 우선 쓴다.
const CODE_MSG = {
  UNSUPPORTED_DOMAIN: "지원하지 않는 학교입니다.",
  EMAIL_TAKEN: "이미 가입된 이메일입니다.",
  INVALID_ADMIN_CODE: "유효하지 않은 코드입니다. 비워두면 학생으로 가입됩니다.",
  INVALID_CREDENTIALS: "이메일 또는 비밀번호가 올바르지 않습니다.",
  VALIDATION_FAILED: "입력 형식을 확인해 주세요.",
};

// 데모 학교·데모 계정 상수는 두지 않는다. 학교 목록은 GET /schools가,
// 로그인 상태는 서버 세션(GET /auth/me)이 유일한 출처다.

export default function AuthPage({ onBack, onLoginSuccess }) {
  const { setUser } = useApp();
  const [tab, setTab] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [schoolSearch, setSchoolSearch] = useState("");
  const [selectedSchool, setSelectedSchool] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isStaff, setIsStaff] = useState(false);
  const [adminCode, setAdminCode] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [schools, setSchools] = useState([]);
  const [error, setError] = useState(""); // 폼 상단 경고
  const [submitting, setSubmitting] = useState(false);

  // 학교 목록은 서버가 정본이다. 실패하면 가짜로 채우지 않고 그 사실을 알린다 —
  // 가짜 학교로 가입시키면 서버가 도메인을 못 찾아 400으로 튕긴다.
  useEffect(() => {
    listSchools()
      .then((rows) => setSchools(rows || []))
      .catch(() => setError("학교 목록을 불러오지 못했습니다. 새로고침해 주세요."));
  }, []);

  const filteredSchools = schoolSearch.trim()
    ? schools
        .filter(
          (s) =>
            s.name.includes(schoolSearch) ||
            s.email_domain.includes(schoolSearch) ||
            (s.aliases || []).some((a) => a.includes(schoolSearch)),
        )
        .slice(0, 8)
    : [];

  const handleSchoolSelect = (school) => {
    setSelectedSchool(school);
    setSchoolSearch(school.name);
    setShowDropdown(false);
    setError("");
  };

  // 로그인/가입 성공 후 실제 서버 세션에서 나를 가져와 세팅 (role·학교는 서버가 정본).
  // 실패하면 로그인시키지 않는다 — 세션 없이 화면만 들여보내면 이후 모든 API가 401이고
  // 프로필은 빈칸이 되며 로그아웃해도 지울 세션이 없다.
  const finishAuth = async () => {
    const me = await getMe(); // { user_id, email, role, school_name }
    if (!me || !me.email) throw new Error("세션을 확인하지 못했습니다.");
    setUser(me);
    onLoginSuccess();
  };

  const showError = (err) => {
    if (err instanceof ApiError) {
      setError(
        err.message || CODE_MSG[err.code] || "요청을 처리하지 못했습니다.",
      );
    } else {
      setError("서버에 연결하지 못했습니다.");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (submitting) return;

    // ── 프론트 선검사 (서버가 정본이지만 UX용으로 먼저 막는다) ──
    if (password.length < 8) {
      setError("비밀번호는 8자 이상이어야 합니다.");
      return;
    }

    try {
      setSubmitting(true);
      if (tab === "login") {
        if (!email.trim()) {
          setError("이메일을 입력하세요.");
          return;
        }
        const normalizedEmail = email.trim().toLowerCase();
        await login(normalizedEmail, password);
      } else {
        if (!selectedSchool) {
          setError("소속 대학교를 선택하세요.");
          return;
        }
        if (!email.trim()) {
          setError("아이디를 입력하세요.");
          return;
        }
        if (isStaff && !adminCode.trim()) {
          setError("관리자 코드를 입력하거나 교직원 체크를 해제하세요.");
          return;
        }
        // 관리자 코드 검증은 서버가 한다(admin_codes 대조). 틀리면 400 INVALID_ADMIN_CODE.
        const fullEmail = `${email.trim()}@${selectedSchool.email_domain}`;
        const code = isStaff ? adminCode.trim() : null;
        await signup(fullEmail, password, code);
      }
      await finishAuth();
    } catch (err) {
      showError(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-back-row">
        <button className="btn-icon" onClick={onBack}>
          <i className="bi bi-chevron-left"></i>
        </button>
      </div>
      <div className="auth-body">
        <div className="auth-logo-row">
          <img
            src="/logo.png"
            alt="다듬이 로고"
            style={{ width: "36px", height: "36px", objectFit: "contain" }}
          />
          <span className="auth-brand">다듬이</span>
        </div>
        <span className="auth-subtitle">캠퍼스 시설 민원 도우미</span>

        <div className="auth-tabs">
          <button
            className={`auth-tab ${tab === "login" ? "active" : ""}`}
            onClick={() => {
              setTab("login");
              setError("");
            }}
          >
            로그인
          </button>
          <button
            className={`auth-tab ${tab === "signup" ? "active" : ""}`}
            onClick={() => {
              setTab("signup");
              setError("");
            }}
          >
            회원가입
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {tab === "signup" && (
            <div className="auth-search-field">
              <i className="bi bi-search"></i>
              <input
                type="text"
                placeholder="소속 대학교 검색"
                value={schoolSearch}
                onChange={(e) => {
                  setSchoolSearch(e.target.value);
                  setShowDropdown(true);
                  setSelectedSchool(null);
                }}
                onFocus={() => setShowDropdown(true)}
              />
              {showDropdown && filteredSchools.length > 0 && (
                <div className="school-dropdown">
                  {filteredSchools.map((s) => (
                    <div
                      key={s.email_domain}
                      className="school-item"
                      onClick={() => handleSchoolSelect(s)}
                    >
                      <span>{s.name}</span>
                      <span className="school-domain">@{s.email_domain}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="auth-input-card">
            <input
              type={tab === "login" ? "email" : "text"}
              placeholder={
                tab === "login" ? "이메일을 입력하세요" : "아이디 입력"
              }
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError("");
              }}
              required
            />
            {tab === "signup" && selectedSchool && (
              <span className="domain-suffix">
                @{selectedSchool.email_domain}
              </span>
            )}
          </div>

          <div className="auth-input-card">
            <input
              type={showPw ? "text" : "password"}
              placeholder="비밀번호 (8자 이상)"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
              required
            />
            <i
              className={`bi bi-eye${showPw ? "-slash" : ""}`}
              onClick={() => setShowPw(!showPw)}
              style={{ cursor: "pointer", color: "#94A3B8" }}
            ></i>
          </div>

          {tab === "signup" && (
            <>
              <label className="staff-check">
                <input
                  type="checkbox"
                  checked={isStaff}
                  onChange={(e) => {
                    setIsStaff(e.target.checked);
                    setError("");
                  }}
                />
                <span>교직원으로 가입 (관리자 코드 필요)</span>
              </label>
              {isStaff && (
                <div className="auth-input-card">
                  <input
                    type="text"
                    placeholder="관리자 코드 입력"
                    value={adminCode}
                    onChange={(e) => {
                      setAdminCode(e.target.value);
                      setError("");
                    }}
                  />
                </div>
              )}
            </>
          )}

          {error && (
            <div
              className="auth-error"
              style={{
                color: "#B91C1C",
                background: "#FEF2F2",
                border: "1px solid #FCA5A5",
                borderRadius: "10px",
                padding: "10px 12px",
                fontSize: "0.82rem",
                fontWeight: 600,
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn-primary-full"
            disabled={submitting}
          >
            {submitting ? "처리 중…" : tab === "login" ? "로그인" : "가입하기"}
          </button>
        </form>

        <div className="auth-footer-link">
          <span
            onClick={() =>
              alert(
                "비밀번호 재설정은 준비 중입니다. 학교 이메일로 문의해 주세요.",
              )
            }
          >
            비밀번호 찾기
          </span>
        </div>
      </div>
    </div>
  );
}

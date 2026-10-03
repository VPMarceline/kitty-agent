import { useState } from "react";
import { apiFetch } from "../api";

function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const response = await apiFetch(`/api/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify({ email, password, displayName }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "请求失败");
      onAuthenticated(data.user);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmitting(false);
    }
  }

  function switchMode(nextMode) {
    setMode(nextMode);
    setError("");
    setPassword("");
  }

  return (
    <main className="auth-page">
      <section className="auth-shell">
        <div className="auth-visual" aria-hidden="true">
          <div className="auth-pixel-cat">🐈</div>
          <span>巨山超力霸</span>
          <p>温暖、克制、尊重隐私的 AI 心理支持小猫</p>
        </div>

        <div className="auth-card">
          <div className="auth-tabs" role="tablist" aria-label="账户操作">
            <button className={mode === "login" ? "active" : ""} onClick={() => switchMode("login")}>
              登录
            </button>
            <button className={mode === "register" ? "active" : ""} onClick={() => switchMode("register")}>
              注册
            </button>
          </div>

          <div className="auth-heading">
            <h1>{mode === "login" ? "欢迎回来" : "创建账户"}</h1>
            <p>{mode === "login" ? "登录后继续和小猫对话" : "密码至少需要10个字符"}</p>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            {mode === "register" && (
              <label>
                显示名称
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  autoComplete="name"
                  maxLength="30"
                  required
                />
              </label>
            )}
            <label>
              邮箱
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                maxLength="254"
                required
              />
            </label>
            <label>
              密码
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                minLength="10"
                maxLength="128"
                required
              />
            </label>

            {error && <div className="auth-error" role="alert">{error}</div>}

            <button className="auth-submit" type="submit" disabled={submitting}>
              {submitting ? "请稍候……" : mode === "login" ? "登录" : "注册并登录"}
            </button>
          </form>

          <p className="auth-privacy">密码只以加盐哈希形式保存。请勿使用其他重要账户的相同密码。</p>
        </div>
      </section>
    </main>
  );
}

export default AuthScreen;

import { useEffect, useRef, useState } from "react";
import AvatarPanel from "./components/AvatarPanel";
import AuthScreen from "./components/AuthScreen";
import { apiFetch } from "./api";
import "./App.css";

const DEFAULT_PROFILE = {
  name: "巨山超力霸",
  coatColor: "#8f8178",
  image: "",
};

function greeting(profile) {
  return {
    role: "assistant",
    content: `你好，我是${profile.name || DEFAULT_PROFILE.name}，一只 AI 心理支持小猫。你希望我先听你说说、一起梳理，还是提供一些建议？`,
  };
}

function App() {
  const [user, setUser] = useState(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isAgentLoaded, setIsAgentLoaded] = useState(false);
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [messages, setMessages] = useState(() => [greeting(DEFAULT_PROFILE)]);

  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [avatarMood, setAvatarMood] = useState("idle");
  const [memoryCount, setMemoryCount] = useState(0);
  const [hasSummary, setHasSummary] = useState(false);
  const bottomRef = useRef(null);
  const moodTimerRef = useRef(null);
  const profileSaveTimerRef = useRef(null);

  useEffect(() => {
    let active = true;
    apiFetch("/api/auth/me")
      .then(async (response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (active) setUser(data?.user || null);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setIsCheckingAuth(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setIsAgentLoaded(false);
      return undefined;
    }

    let active = true;
    setIsAgentLoaded(false);
    apiFetch("/api/agent")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Agent 加载失败");
        return data;
      })
      .then((data) => {
        if (!active) return;
        const nextProfile = { ...DEFAULT_PROFILE, ...data.profile };
        setProfile(nextProfile);
        setMessages(data.messages?.length ? data.messages : [greeting(nextProfile)]);
        setMemoryCount(data.memories?.length || 0);
        setHasSummary(Boolean(data.hasSummary));
        setIsAgentLoaded(true);
      })
      .catch(() => {
        if (!active) return;
        setProfile(DEFAULT_PROFILE);
        setMessages([greeting(DEFAULT_PROFILE)]);
        setIsAgentLoaded(true);
      });

    return () => {
      active = false;
    };
  }, [user]);

  useEffect(() => {
    if (!user || !isAgentLoaded) return undefined;
    window.clearTimeout(profileSaveTimerRef.current);
    profileSaveTimerRef.current = window.setTimeout(() => {
      apiFetch("/api/agent/profile", {
        method: "PUT",
        body: JSON.stringify(profile),
      }).catch(() => {});
    }, 500);
    return () => window.clearTimeout(profileSaveTimerRef.current);
  }, [profile, user, isAgentLoaded]);

  useEffect(
    () => () => {
      window.clearTimeout(moodTimerRef.current);
    },
    []
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages, isLoading]);

  async function sendMessage() {
    const content = input.trim();

    if (!content || isLoading) {
      return;
    }

    const userMessage = {
      role: "user",
      content,
    };

    const nextMessages = [...messages, userMessage];

    setMessages(nextMessages);
    setInput("");
    setIsLoading(true);
    setAvatarMood("thinking");
    window.clearTimeout(moodTimerRef.current);

    try {
      const response = await apiFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({ message: content }),
      });

      const data = await response.json();

      if (response.status === 401) {
        setUser(null);
        throw new Error("登录已过期，请重新登录");
      }
      if (!response.ok) {
        throw new Error(data.error || "请求失败");
      }

      setMessages((current) => [
        ...current,
        {
          ...data.message,
          safety: data.safety,
          sources: data.sources || [],
        },
      ]);
      if (data.memory) {
        setMemoryCount(data.memory.count || 0);
        setHasSummary(Boolean(data.memory.hasSummary));
      }
      setAvatarMood("speaking");
      moodTimerRef.current = window.setTimeout(() => {
        setAvatarMood("idle");
      }, 3200);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: `连接失败：${error.message}`,
        },
      ]);
      setAvatarMood("idle");
    } finally {
      setIsLoading(false);
    }
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }

  async function clearMessages() {
    try {
      const response = await apiFetch("/api/agent/messages", { method: "DELETE" });
      if (!response.ok) throw new Error("清空失败");
      setMessages([greeting(profile)]);
      setAvatarMood("idle");
    } catch {
      setMessages((current) => [
        ...current,
        { role: "assistant", content: "暂时无法清空对话，请稍后重试。" },
      ]);
    }
  }

  async function clearLongTermContext() {
    if (!window.confirm("确定清除当前账户的长期记忆和旧对话摘要吗？最近的聊天记录仍会保留。")) {
      return;
    }
    try {
      const response = await apiFetch("/api/agent/long-term-context", {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("清除失败");
      setMemoryCount(0);
      setHasSummary(false);
    } catch {
      setMessages((current) => [
        ...current,
        { role: "assistant", content: "暂时无法清除长期记忆，请稍后重试。" },
      ]);
    }
  }

  async function logout() {
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } finally {
      setUser(null);
      setIsAgentLoaded(false);
      setProfile(DEFAULT_PROFILE);
      setMessages([greeting(DEFAULT_PROFILE)]);
      setMemoryCount(0);
      setHasSummary(false);
    }
  }

  if (isCheckingAuth || (user && !isAgentLoaded)) {
    return <main className="auth-page"><div className="auth-loading">正在确认登录状态……</div></main>;
  }

  if (!user) {
    return <AuthScreen onAuthenticated={setUser} />;
  }

  return (
    <main className="page">
      <section className="app-shell">
        <AvatarPanel
          profile={profile}
          mood={avatarMood}
          onProfileChange={setProfile}
        />

        <section className="chat">
        <header className="header">
          <div className="avatar">
            {profile.image ? <img src={profile.image} alt="小猫头像" /> : "🐈"}
          </div>

          <div className="identity">
            <h1>{profile.name || "未命名小猫"}</h1>
            <p>
              <span className="online-dot"></span>
              AI 心理支持小猫
            </p>
          </div>

          <div className="header-actions">
            <span className="user-chip" title={user.email}>{user.displayName}</span>
            <button
              className="clear-button"
              onClick={clearLongTermContext}
              title="清除长期记忆与旧对话摘要"
            >
              记忆 {memoryCount}{hasSummary ? " + 摘要" : ""}
            </button>
            <button className="clear-button" onClick={clearMessages}>清空对话</button>
            <button className="logout-button" onClick={logout}>退出</button>
          </div>
        </header>

        <div className="safety-notice" role="note">
          <strong>使用提示：</strong>这是 AI 心理支持，不替代心理咨询、诊断或治疗。对话会保存到当前账户，并可能生成摘要；只有你明确说“请记住……”的信息才会进入长期记忆。请勿发送身份证、住址等敏感信息；如有立即危险，请联系当地紧急服务，中国大陆可拨 120 或 110。
        </div>

        <section className="message-list">
          {messages.map((message, index) => (
            <div
              className={`message-row ${message.role} ${message.safety?.crisis ? "crisis" : ""}`}
              key={`${message.role}-${index}`}
            >
              {message.role === "assistant" && (
                <div className="small-avatar">
                  {profile.image ? <img src={profile.image} alt="" /> : "🐈"}
                </div>
              )}

              <div className="bubble">
                <div>{message.content}</div>
                {message.sources?.length > 0 && (
                  <div className="message-sources">
                    <strong>参考资料</strong>
                    <ul>
                      {message.sources.map((source) => (
                        <li key={source.id}>
                          {source.url ? (
                            <a href={source.url} target="_blank" rel="noreferrer">
                              {source.title}
                            </a>
                          ) : (
                            <span>{source.title}</span>
                          )}
                          {source.organization && ` · ${source.organization}`}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="message-row assistant">
              <div className="small-avatar">🐈</div>
              <div className="bubble loading">
                {profile.name || "小猫"}正在思考……
              </div>
            </div>
          )}

          <div ref={bottomRef}></div>
        </section>

        <footer className="input-area">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`和${profile.name || "小猫"}说点什么……`}
            disabled={isLoading}
            rows="1"
          />

          <button
            className="send-button"
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
          >
            发送
          </button>
        </footer>
        </section>
      </section>
    </main>
  );
}

export default App;

import { useState, useEffect } from "react";
import { supabase } from "./supabase";
import Auth from "./Auth";
import "./App.css";

export default function App() {
  const [session, setSession] = useState(null);
  const [jobDesc, setJobDesc] = useState("");
  const [resume, setResume] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState("");
  const [activeTab, setActiveTab] = useState("skills");
  const [isPro, setIsPro] = useState(false);

  // Check if user is logged in on page load
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) checkProStatus(session.user.id);
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) checkProStatus(session.user.id);
    });
  }, []);

  const checkProStatus = async (userId) => {
    const { data } = await supabase
      .from("profiles")
      .select("is_pro")
      .eq("id", userId)
      .single();
    if (data) setIsPro(data.is_pro);
  };

  const handleUpgrade = async () => {
    const res = await fetch("http://127.0.0.1:8080/create-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: session.user.id,
        email: session.user.email,
      }),
    });
    const data = await res.json();
    window.location.href = data.checkout_url;
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      setError("Please upload a PDF file only.");
      return;
    }
    setUploading(true);
    setError("");
    setFileName(file.name);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("http://127.0.0.1:8080/upload-resume", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      setResume(data.resume_text);
    } catch (err) {
      setError("Failed to upload PDF. Is your backend running?");
      setFileName("");
    }
    setUploading(false);
  };

  const handleAnalyze = async () => {
    if (!jobDesc.trim() || !resume.trim()) {
      setError("Please fill in both the job description and your resume.");
      return;
    }
    setError("");
    setResult(null);
    setLoading(true);
    try {
      const response = await fetch("http://127.0.0.1:8080/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Send auth token so backend knows who is calling
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          job_description: jobDesc,
          resume_text: resume,
        }),
      });

      if (response.status === 403) {
        setError("You have used your 2 free analyses. Please upgrade to Pro.");
        setLoading(false);
        return;
      }

      const data = await response.json();
      setResult(data);
      setActiveTab("skills");
    } catch (err) {
      setError("Could not connect to server. Is your backend running?");
    }
    setLoading(false);
  };

  const handleKeyDown = (e) => {
    if (e.ctrlKey && e.key === "Enter") handleAnalyze();
  };

  const scoreColor = result
    ? result.match_score >= 75 ? "#16a34a"
      : result.match_score >= 50 ? "#d97706"
        : "#dc2626"
    : "#6366f1";

  // Show auth screen if not logged in
  if (!session) return <Auth />;

  return (
    <div className="app">
      <header className="header">
        <h1 className="header-title">CareerFit AI</h1>
        <div className="header-right">
          {isPro ? (
            <span className="pro-badge">Pro</span>
          ) : (
            <button className="upgrade-btn" onClick={handleUpgrade}>
              Upgrade to Pro — $9/mo
            </button>
          )}
          <span className="user-email">{session.user.email}</span>
          <button
            className="signout-btn"
            onClick={() => supabase.auth.signOut()}
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="main">
        <div className="inputs-grid">
          <div className="input-group">
            <label className="label">
              Job Description
              <span className="label-hint">Paste the full job posting</span>
            </label>
            <textarea
              className="textarea"
              placeholder="Paste the job description here..."
              value={jobDesc}
              onChange={(e) => setJobDesc(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={12}
            />
            <span className="char-count">{jobDesc.length} characters</span>
          </div>

          <div className="input-group">
            <label className="label">
              Your Resume
              <span className="label-hint">Paste text or upload PDF</span>
            </label>
            <div className="upload-box">
              <input
                type="file"
                accept=".pdf"
                id="pdf-upload"
                style={{ display: "none" }}
                onChange={handleFileUpload}
              />
              <label htmlFor="pdf-upload" className="upload-label">
                {uploading ? "Extracting text..." : fileName ? `✓ ${fileName}` : "↑ Upload PDF Resume"}
              </label>
            </div>
            <p className="upload-divider">or paste text below</p>
            <textarea
              className="textarea"
              placeholder="Paste your resume text here..."
              value={resume}
              onChange={(e) => setResume(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={8}
            />
            <span className="char-count">{resume.length} characters</span>
          </div>
        </div>

        {!isPro && (
          <div className="free-banner">
            You are on the free plan — 2 analyses included.
            <span onClick={handleUpgrade}>Upgrade for unlimited access</span>
          </div>
        )}

        {error && <div className="error-box">{error}</div>}

        <button
          className={`analyze-btn ${loading ? "loading" : ""}`}
          onClick={handleAnalyze}
          disabled={loading || uploading}
        >
          {loading ? (
            <span className="btn-content">
              <span className="spinner" />
              Analyzing your application...
            </span>
          ) : "Analyze My Application"}
        </button>

        <p className="keyboard-hint">or press Ctrl + Enter</p>

        {result && (
          <div className="results">
            <div className="score-card">
              <p className="score-label">Match Score</p>
              <p className="score-number" style={{ color: scoreColor }}>
                {result.match_score}%
              </p>
              <div className="score-bar-bg">
                <div className="score-bar-fill" style={{ width: `${result.match_score}%`, background: scoreColor }} />
              </div>
              <p className="score-hint">
                {result.match_score >= 75 ? "Strong match — apply with confidence"
                  : result.match_score >= 50 ? "Decent match — a few gaps to address"
                    : "Weak match — significant gaps to close"}
              </p>
            </div>

            <div className="tabs">
              {["skills", "improvements", "cover_letter", "interview"].map((tab) => (
                <button
                  key={tab}
                  className={`tab-btn ${activeTab === tab ? "active" : ""}`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab === "skills" && "Skills"}
                  {tab === "improvements" && "Resume fixes"}
                  {tab === "cover_letter" && "Cover letter"}
                  {tab === "interview" && "Interview prep"}
                </button>
              ))}
            </div>

            {activeTab === "skills" && (
              <div className="tab-content">
                <div className="skills-grid">
                  <div className="skills-box matched">
                    <h3 className="skills-title">Matched skills</h3>
                    {result.matched_skills.map((skill, i) => (
                      <div key={i} className="skill-tag matched-tag">{skill}</div>
                    ))}
                  </div>
                  <div className="skills-box missing">
                    <h3 className="skills-title">Missing skills</h3>
                    {result.missing_skills.map((skill, i) => (
                      <div key={i} className="skill-tag missing-tag">{skill}</div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "improvements" && (
              <div className="tab-content">
                {result.resume_improvements.map((item, i) => (
                  <div key={i} className="improvement-card">
                    <div className="improvement-before">
                      <span className="improvement-label before-label">Before</span>
                      <p>{item.original}</p>
                    </div>
                    <div className="improvement-arrow">↓</div>
                    <div className="improvement-after">
                      <span className="improvement-label after-label">After</span>
                      <p>{item.improved}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === "cover_letter" && (
              <div className="tab-content">
                <div className="cover-letter-box">
                  <div className="cover-letter-header">
                    <h3>Cover Letter</h3>
                    <button className="copy-btn" onClick={() => navigator.clipboard.writeText(result.cover_letter)}>Copy</button>
                  </div>
                  <p className="cover-letter-text">{result.cover_letter}</p>
                </div>
              </div>
            )}

            {activeTab === "interview" && (
              <div className="tab-content">
                {result.interview_questions.map((item, i) => (
                  <div key={i} className="interview-card">
                    <p className="interview-question">Q{i + 1}: {item.question}</p>
                    <p className="interview-tip">{item.tip}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
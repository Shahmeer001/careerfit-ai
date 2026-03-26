import { useState } from "react";
import { supabase } from "./supabase";
import "./Auth.css";

export default function Auth() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isLogin, setIsLogin] = useState(true);
    const [message, setMessage] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async () => {
        if (!email || !password) {
            setMessage("Please fill in both fields.");
            return;
        }
        setLoading(true);
        setMessage("");

        if (isLogin) {
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) setMessage(error.message);
        } else {
            const { error } = await supabase.auth.signUp({ email, password });
            if (error) setMessage(error.message);
            else setMessage("Check your email to confirm your account!");
        }
        setLoading(false);
    };

    const handleKey = (e) => {
        if (e.key === "Enter") handleSubmit();
    };

    return (
        <div className="auth-wrapper">
            <div className="auth-card">
                <h1 className="auth-logo">CareerFit AI</h1>
                <p className="auth-tagline">AI-powered job application assistant</p>

                <h2 className="auth-title">{isLogin ? "Sign in" : "Create account"}</h2>

                <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={handleKey}
                    className="auth-input"
                />
                <input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={handleKey}
                    className="auth-input"
                />

                <button
                    className="auth-btn"
                    onClick={handleSubmit}
                    disabled={loading}
                >
                    {loading ? "Please wait..." : isLogin ? "Sign in" : "Sign up"}
                </button>

                {message && (
                    <p className={`auth-message ${message.includes("Check") ? "success" : "error"}`}>
                        {message}
                    </p>
                )}

                <p className="auth-switch">
                    {isLogin ? "No account? " : "Already have one? "}
                    <span onClick={() => { setIsLogin(!isLogin); setMessage(""); }}>
                        {isLogin ? "Sign up" : "Sign in"}
                    </span>
                </p>
            </div>
        </div>
    );
}   
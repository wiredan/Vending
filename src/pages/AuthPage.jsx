import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { FiMail, FiLock, FiUser, FiPhone, FiSmartphone } from 'react-icons/fi';
import { useAuth } from '../context/AuthContext';

export default function AuthPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanPassword = String(password || '');

    if (!cleanEmail || !cleanPassword) {
      setErrorMsg('Enter both email and password.');
      return;
    }

    if (mode === 'register' && cleanPassword.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }

    setSubmitting(true);
    try {
      const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
      const bodyPayload =
        mode === 'register'
          ? {
              email: cleanEmail,
              password: cleanPassword,
              full_name: String(fullName || '').trim(),
              phone: String(phone || '').trim(),
            }
          : {
              email: cleanEmail,
              password: cleanPassword,
            };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(bodyPayload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        setErrorMsg(data?.error || data?.message || 'Authentication failed.');
        return;
      }

      login(data.user || data, data.token);
      navigate('/vending', { replace: true });
    } catch {
      setErrorMsg('Network error while authenticating.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleSuccess = async (credentialResponse) => {
    setErrorMsg('');
    const idToken = credentialResponse?.credential;
    if (!idToken) {
      setErrorMsg('Google sign-in did not return a credential.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ credential: idToken }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        setErrorMsg(data?.error || data?.message || 'Google sign-in failed.');
        return;
      }

      login(data.user || data, data.token);
      navigate('/vending', { replace: true });
    } catch {
      setErrorMsg('Network error during Google sign-in.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md bg-slate-900/95 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5">
        <div className="text-center space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[11px] font-black uppercase tracking-wider">
            <FiSmartphone size={13} /> Universal Vending &amp; Voucher Hub
          </div>
          <h1 className="text-2xl font-black text-white pt-1">
            {mode === 'login' ? 'Sign In to Vending Hub' : 'Create Vending Account'}
          </h1>
          <p className="text-xs text-slate-400">
            Use Email &amp; Password or continue with Google OAuth.
          </p>
        </div>

        <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-950 border border-slate-800">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setErrorMsg('');
            }}
            className={`py-2 text-xs font-black uppercase rounded-lg transition-all cursor-pointer ${
              mode === 'login' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
            }`}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setErrorMsg('');
            }}
            className={`py-2 text-xs font-black uppercase rounded-lg transition-all cursor-pointer ${
              mode === 'register' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-white'
            }`}
          >
            Sign Up
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-500/40 text-rose-200 text-xs font-semibold">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleEmailSubmit} className="space-y-3">
          {mode === 'register' && (
            <>
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Full Name</label>
                <div className="relative">
                  <FiUser className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    placeholder="e.g. Murtala Maaruf"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl pl-10 pr-3 py-3 text-xs text-white outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Phone Number</label>
                <div className="relative">
                  <FiPhone className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                  <input
                    type="tel"
                    placeholder="08012345678"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl pl-10 pr-3 py-3 text-xs text-white outline-none"
                  />
                </div>
              </div>
            </>
          )}

          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Email Address</label>
            <div className="relative">
              <FiMail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
              <input
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl pl-10 pr-3 py-3 text-xs text-white outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Password</label>
            <div className="relative">
              <FiLock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl pl-10 pr-3 py-3 text-xs text-white outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 disabled:opacity-60 text-slate-950 font-black text-xs uppercase tracking-wider py-3.5 rounded-xl transition-all cursor-pointer shadow-lg"
          >
            {submitting
              ? 'Processing...'
              : mode === 'login'
                ? 'Sign In with Email'
                : 'Create Account'}
          </button>
        </form>

        <div className="relative py-1 flex items-center justify-center">
          <div className="border-t border-slate-800 w-full" />
          <span className="bg-slate-900 px-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Or
          </span>
          <div className="border-t border-slate-800 w-full" />
        </div>

        <div className="flex justify-center">
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={() => setErrorMsg('Google OAuth popup was closed or failed.')}
            theme="filled_black"
            shape="pill"
            text={mode === 'login' ? 'signin_with' : 'signup_with'}
          />
        </div>
      </div>
    </div>
  );
}

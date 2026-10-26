'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import api, { setStoredTokens } from '../../lib/api';
import { useAuthStore } from '../../store/authStore';
import { formatRole } from '../../lib/formatters';
import {
  Lock,
  Mail,
  User,
  Building,
  ArrowRight,
  ArrowLeft,
  ChevronDown,
  CheckCircle2,
  Layers,
  Kanban,
  Users,
  BarChart3,
  Calendar,
  Eye,
  EyeOff,
  ShieldCheck,
  KeyRound,
  RotateCw,
  LogOut
} from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading, fetchUser, logout, setUser, setCurrentWorkspace } = useAuthStore();

  const [isRegister, setIsRegister] = useState(false);
  const [accountType, setAccountType] = useState<'organization' | 'personal'>('organization');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [workspaceName, setWorkspaceName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');

  // Check existing session on mount
  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  // Direct Instant Registration (No OTP needed)
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setInfoMessage('');

    try {
      const defaultWs = accountType === 'personal'
        ? (workspaceName.trim() || `${name.split(' ')[0] || 'My'}'s Personal Space`)
        : (workspaceName.trim() || `${name.split(' ')[0] || 'My'}'s Workspace`);

      const res = await api.post('/auth/register', {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password,
        accountType,
        workspaceName: defaultWs
      });

      setStoredTokens(res.data.data.tokens.accessToken, res.data.data.tokens.refreshToken, true);
      setUser(res.data.data.user);
      setCurrentWorkspace(res.data.data.workspace);
      router.replace('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Registration failed. Please check your details and try again.');
    } finally {
      setLoading(false);
    }
  };

  // Standard Login
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await api.post('/auth/login', { email, password });

      setStoredTokens(res.data.data.tokens.accessToken, res.data.data.tokens.refreshToken, true);
      setUser(res.data.data.user);
      if (res.data.data.workspace) {
        setCurrentWorkspace(res.data.data.workspace);
      }
      router.replace('/');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Authentication failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-[#F8FAFC] text-slate-900 flex flex-col justify-between overflow-x-hidden">
      {/* Subtle Dot Grid & Ambient Radial Glows */}
      <div
        className="absolute inset-0 pointer-events-none opacity-50"
        style={{
          backgroundImage: 'radial-gradient(rgba(15, 23, 42, 0.08) 1px, transparent 1px)',
          backgroundSize: '24px 24px'
        }}
      />
      <div className="absolute top-0 left-1/4 w-[600px] h-[350px] bg-radial from-[#22C55E]/10 via-[#0F172A]/5 to-transparent blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-10 w-[500px] h-[350px] bg-radial from-[#0F172A]/5 via-transparent to-transparent blur-3xl pointer-events-none" />

      {/* Top Navbar */}
      <header className="relative z-20 max-w-7xl mx-auto w-full px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#0F172A] border border-slate-800 shadow-sm flex items-center justify-center">
            <span className="font-black text-sm text-[#22C55E] tracking-wider">OS</span>
          </div>
          <div>
            <span className="text-base font-black tracking-tight text-[#0F172A]">
              Outdid <span className="text-[#22C55E]">Sync</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 hidden sm:inline">
            {isRegister ? 'Already have an account?' : 'Need a new workspace?'}
          </span>
          <button
            type="button"
            onClick={() => {
              setIsRegister(!isRegister);
              setError('');
              setInfoMessage('');
            }}
            className="text-xs font-bold px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-[#0F172A] transition-all shadow-xs cursor-pointer"
          >
            {isRegister ? 'Sign In' : 'Create Workspace'}
          </button>
        </div>
      </header>

      {/* Main Split Hero Section */}
      <main className="relative z-10 max-w-7xl mx-auto w-full px-6 py-4 md:py-8 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
        {/* Left Column: Product Storytelling & Miniature UI Preview */}
        <div className="lg:col-span-7 flex flex-col justify-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200/80 text-emerald-800 text-xs font-semibold w-fit mb-4">
            <span className="w-2 h-2 rounded-full bg-[#22C55E] animate-pulse" />
            <span>One workspace. Every project.</span>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-[#0F172A] leading-[1.15]">
            Turn work into <span className="text-[#22C55E]">progress.</span>
          </h1>

          <p className="mt-3 text-sm sm:text-base text-slate-600 font-normal leading-relaxed max-w-xl">
            Plan projects, manage sprints, collaborate with your team, and ship faster — all in one modern workspace.
          </p>

          {/* Value Props Checklist */}
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs text-slate-700 font-medium max-w-xl">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-[#22C55E] shrink-0" />
              <span>Multi-project agile backlog & spaces</span>
            </div>
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-[#22C55E] shrink-0" />
              <span>Interactive Kanban & sprint cycles</span>
            </div>
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-[#22C55E] shrink-0" />
              <span>Real-time presence & instantaneous sync</span>
            </div>
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-[#22C55E] shrink-0" />
              <span>Timeline roadmaps & delivery analytics</span>
            </div>
          </div>

          {/* Workspace Capabilities Showcase */}
          <div className="mt-7 grid grid-cols-1 sm:grid-cols-2 gap-3.5 max-w-xl">
            {/* Card 1: Sprint Velocity & Real-time Sync */}
            <div className="p-4 bg-white/85 backdrop-blur-md border border-slate-200/80 rounded-2xl shadow-2xs hover:border-slate-300 transition-all">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-2.5">
                <Kanban className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-bold text-slate-800">Sprint & Backlog Engine</h3>
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                Dynamic drag-and-drop boards, epics, stories, and sprint cycles with live socket sync.
              </p>
            </div>

            {/* Card 2: Timeline & Milestones */}
            <div className="p-4 bg-white/85 backdrop-blur-md border border-slate-200/80 rounded-2xl shadow-2xs hover:border-slate-300 transition-all">
              <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mb-2.5">
                <Calendar className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-bold text-slate-800">Timeline & Delivery Roadmaps</h3>
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                Visual release roadmaps, milestone tracking, and task deadline calendar views.
              </p>
            </div>

            {/* Card 3: Multi-Space Management */}
            <div className="p-4 bg-white/85 backdrop-blur-md border border-slate-200/80 rounded-2xl shadow-2xs hover:border-slate-300 transition-all">
              <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-2.5">
                <Layers className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-bold text-slate-800">Spaces & Projects</h3>
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                Group projects into dedicated team spaces with tailored workflows and custom fields.
              </p>
            </div>

            {/* Card 4: Team Collaboration */}
            <div className="p-4 bg-white/85 backdrop-blur-md border border-slate-200/80 rounded-2xl shadow-2xs hover:border-slate-300 transition-all">
              <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center mb-2.5">
                <Users className="w-4 h-4" />
              </div>
              <h3 className="text-xs font-bold text-slate-800">Role-Based Access</h3>
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                Granular permissions across Org Admins, Project Managers, Developers, and QA.
              </p>
            </div>
          </div>
        </div>

        {/* Right Column: Clean Elevated Auth Card */}
        <div className="lg:col-span-5 flex justify-center">
          <div className="bg-white border border-slate-200/90 rounded-3xl shadow-xl shadow-slate-300/40 w-full max-w-[440px] overflow-hidden relative transition-all">
            {/* Top Accent Gradient Line */}
            <div className="h-1.5 w-full bg-gradient-to-r from-[#22C55E] via-[#0F172A] to-[#22C55E]" />

            <div className="p-7 sm:p-9">
              {isAuthenticated && user ? (
                <div>
                  <div className="text-center">
                    <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200/80 shadow-xs flex items-center justify-center mx-auto mb-3.5">
                      <ShieldCheck className="w-7 h-7 text-[#22C55E]" />
                    </div>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200/80 text-emerald-800 text-[10px] font-bold mb-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse" />
                      <span>Active Session Detected</span>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-black tracking-tight text-[#0F172A]">
                      Already Signed In
                    </h2>
                    <p className="text-xs text-slate-500 mt-1 font-medium">
                      You are currently authenticated in this workspace session.
                    </p>
                  </div>

                  {/* Profile Preview */}
                  <div className="mt-5 p-3.5 bg-slate-50/90 border border-slate-200 rounded-2xl flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#0F172A] text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-xs">
                      {user.avatar ? (
                        <img src={user.avatar} alt={user.name} className="w-full h-full rounded-xl object-cover" />
                      ) : (
                        user.name?.[0]?.toUpperCase() || <User className="w-5 h-5" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-bold text-slate-900 truncate">{user.name}</p>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                          {formatRole(user.role)}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">{user.email}</p>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 text-center mt-4">
                    Would you like to return to your workspace, or log out of this account?
                  </p>

                  <div className="mt-6 flex flex-col gap-2.5">
                    <button
                      type="button"
                      onClick={() => router.replace('/')}
                      className="w-full bg-gradient-to-r from-[#0F172A] via-[#1E293B] to-[#0F172A] hover:opacity-95 active:scale-[0.99] text-white py-3 rounded-xl text-xs font-bold shadow-md shadow-slate-900/10 hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <span>Continue to Workspace</span>
                      <ArrowRight className="w-4 h-4 text-[#22C55E]" />
                    </button>

                    <button
                      type="button"
                      onClick={() => logout(false)}
                      className="w-full py-2.5 px-4 bg-white hover:bg-rose-50 text-slate-700 hover:text-rose-600 text-xs font-bold rounded-xl transition-all border border-slate-200 hover:border-rose-200 flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Log Out of this Account</span>
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Security Pill & Header */}
                  <div className="mb-6">
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200/80 text-emerald-800 text-[10px] font-bold mb-2.5">
                      <ShieldCheck className="w-3 h-3 text-[#22C55E]" />
                      <span>Outdid Workspace Portal</span>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-black tracking-tight text-[#0F172A]">
                      {isRegister ? 'Create your workspace' : 'Welcome back'}
                    </h2>
                    <p className="text-xs text-slate-500 mt-1 font-medium">
                      {isRegister
                        ? 'Set up your team workspace in under 60 seconds.'
                        : 'Sign in to access your projects and live backlogs.'}
                    </p>
                  </div>

                  {infoMessage && (
                    <div className="mb-5 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>{infoMessage}</span>
                    </div>
                  )}

                  {error && (
                    <div className="mb-5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold animate-shake">
                      {error}
                    </div>
                  )}

                  {/* REGISTRATION OR LOGIN FORM */}
                  <form
                    onSubmit={isRegister ? handleRegisterSubmit : handleLoginSubmit}
                    className="flex flex-col gap-4"
                  >
                      {isRegister && (
                        <>
                          {/* Account Type Segmented Tab */}
                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                              Workspace Type *
                            </label>
                            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100/90 rounded-xl border border-slate-200">
                              <button
                                type="button"
                                onClick={() => setAccountType('organization')}
                                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                                  accountType === 'organization'
                                    ? 'bg-white text-[#0F172A] shadow-xs border border-slate-200/80'
                                    : 'text-slate-500 hover:text-slate-800'
                                }`}
                              >
                                <Building className="w-3.5 h-3.5" />
                                <span>Organization</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setAccountType('personal')}
                                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                                  accountType === 'personal'
                                    ? 'bg-white text-[#0F172A] shadow-xs border border-slate-200/80'
                                    : 'text-slate-500 hover:text-slate-800'
                                }`}
                              >
                                <User className="w-3.5 h-3.5" />
                                <span>Personal</span>
                              </button>
                            </div>
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                              Full Name *
                            </label>
                            <div className="relative">
                              <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                              <input
                                type="text"
                                required
                                placeholder="e.g. Sai Santhan"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full pl-9 pr-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-[#0F172A] focus:ring-4 focus:ring-[#0F172A]/5 text-slate-800 font-medium transition-all"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                              {accountType === 'organization' ? 'Organization / Company Name *' : 'Workspace Name'}
                            </label>
                            <div className="relative">
                              {accountType === 'organization' ? (
                                <Building className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                              ) : (
                                <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                              )}
                              <input
                                type="text"
                                required={accountType === 'organization'}
                                placeholder={accountType === 'organization' ? 'e.g. Outdid' : 'e.g. My Workspace'}
                                value={workspaceName}
                                onChange={(e) => setWorkspaceName(e.target.value)}
                                className="w-full pl-9 pr-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-[#0F172A] focus:ring-4 focus:ring-[#0F172A]/5 text-slate-800 font-medium transition-all"
                              />
                            </div>
                          </div>
                        </>
                      )}

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                          Work Email *
                        </label>
                        <div className="relative">
                          <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type="email"
                            required
                            placeholder="name@company.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full pl-9 pr-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-[#0F172A] focus:ring-4 focus:ring-[#0F172A]/5 text-slate-800 font-medium transition-all"
                          />
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                            Password *
                          </label>
                        </div>
                        <div className="relative">
                          <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                          <input
                            type={showPassword ? 'text' : 'password'}
                            required
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full pl-9 pr-10 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:bg-white focus:border-[#0F172A] focus:ring-4 focus:ring-[#0F172A]/5 text-slate-800 font-medium transition-all"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer transition-colors p-1"
                            tabIndex={-1}
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={loading}
                        className="mt-2 w-full bg-gradient-to-r from-[#0F172A] via-[#1E293B] to-[#0F172A] hover:opacity-95 active:scale-[0.99] text-white py-3.5 rounded-xl text-xs font-bold shadow-md shadow-slate-900/10 hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        <span>
                          {loading
                            ? isRegister
                              ? 'Creating Workspace...'
                              : 'Authenticating...'
                            : isRegister
                            ? 'Create Account & Launch'
                            : 'Sign In to Workspace'}
                        </span>
                        <ArrowRight className="w-4 h-4 text-[#22C55E]" />
                      </button>
                    </form>

                  {/* Bottom Toggle */}
                  <div className="mt-5 text-center text-xs text-slate-500">
                    {isRegister ? (
                      <span>
                        Already have an account?{' '}
                        <button
                          type="button"
                          onClick={() => {
                            setIsRegister(false);
                            setError('');
                            setInfoMessage('');
                          }}
                          className="text-[#0F172A] font-bold hover:underline cursor-pointer ml-1"
                        >
                          Sign in
                        </button>
                      </span>
                    ) : (
                      <span>
                        Need an account?{' '}
                        <button
                          type="button"
                          onClick={() => {
                            setIsRegister(true);
                            setError('');
                            setInfoMessage('');
                            setEmail('');
                            setPassword('');
                          }}
                          className="text-[#0F172A] font-bold hover:underline cursor-pointer ml-1"
                        >
                          Create one
                        </button>
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 max-w-7xl mx-auto w-full px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
        <div className="flex items-center gap-4">
          <span>© 2026 Outdid Sync</span>
          <span>·</span>
          <a
            href="https://outdidunified.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-slate-600 transition-colors font-medium"
          >
            Built by Outdid
          </a>
        </div>

        <div className="flex items-center gap-4 text-slate-400">
          <span>Plan</span>
          <span>·</span>
          <span>Build</span>
          <span>·</span>
          <span>Track</span>
          <span>·</span>
          <span>Ship</span>
        </div>
      </footer>
    </div>
  );
}



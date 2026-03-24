'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence, Variants } from 'framer-motion';
import { Eye, EyeOff, Mail, Lock, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { postJson } from '../apiClient';

interface LoginResponse {
  token: string;
  user: {
    id: number;
    email: string;
    role: 'SUPER_ADMIN' | 'ADMIN';
  };
}

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { 
        staggerChildren: 0.1,
        delayChildren: 0.2
      } 
    }
  };

  const itemVariants: Variants = {
    hidden: { y: 20, opacity: 0 },
    visible: { 
      y: 0, 
      opacity: 1,
      transition: { type: 'spring', stiffness: 300, damping: 24 }
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      const data = await postJson<LoginResponse>('/auth/login', { email, password });

      if (typeof window !== 'undefined') {
        window.localStorage.setItem('wp_token', data.token);
        window.localStorage.setItem('wp_user', JSON.stringify(data.user));
      }

      router.push('/dashboard');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to sign in. Please try again.';
      setError(message);
    }
  };

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-[#050816] via-[#050816] to-[#022c22] font-display antialiased text-slate-100 font-[family-name:var(--font-inter)]">
      
      {/* Left Side: Login Form */}
      <div className="flex w-full flex-col justify-center px-6 py-10 lg:w-1/2 lg:px-16 xl:px-24">
        <motion.div 
          className="mx-auto w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/50 shadow-[0_18px_60px_rgba(15,23,42,0.9)] backdrop-blur-2xl px-8 py-10"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* Logo */}
          <motion.div variants={itemVariants} className="flex items-center gap-3 mb-10">
            <motion.div 
              whileHover={{ scale: 1.05 }}
              transition={{ type: "spring", stiffness: 400, damping: 10 }}
              className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl"
            >
              <Image src="/logo.jpg" alt="WorkPilot" fill className="object-contain" />
            </motion.div>
            <div className="flex flex-col">
              <h2 className="text-2xl font-semibold tracking-tight text-white">WorkPilot</h2>
              <p className="text-xs text-slate-400 uppercase tracking-[0.25em] mt-1">
                CRM CONSOLE
              </p>
            </div>
          </motion.div>

          {/* Header */}
          <motion.div variants={itemVariants} className="mb-8">
            <h1 className="text-3xl font-black text-white leading-tight tracking-tight">
              Welcome back
            </h1>
            <p className="mt-3 text-sm text-slate-400">
              Log in to your CRM command center and keep your pipeline moving.
            </p>
          </motion.div>

          {/* Form */}
          <motion.form variants={itemVariants} onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label 
                className="block text-xs font-medium tracking-wide text-slate-300 uppercase" 
                htmlFor="email"
              >
                Email address
              </label>
              <div className="relative mt-1 group">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500 group-focus-within:text-primary">
                  <Mail size={18} />
                </span>
                <input 
                  id="email" 
                  name="email" 
                  type="email" 
                  autoComplete="email" 
                  required 
                  placeholder="name@company.com" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full rounded-2xl border border-slate-800/80 bg-slate-900/70 py-3 pl-10 pr-3 text-sm text-slate-100 shadow-[0_0_0_1px_rgba(15,23,42,0.7)] outline-none ring-1 ring-transparent placeholder:text-slate-500 transition-all duration-200 group-hover:border-slate-600 group-hover:shadow-[0_0_0_1px_rgba(30,64,175,0.7),0_18px_45px_rgba(15,23,42,0.85)] focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/60 focus:shadow-[0_0_0_1px_rgba(45,212,191,0.9),0_20px_60px_rgba(5,46,22,0.9)]" 
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label 
                  className="block text-xs font-medium tracking-wide text-slate-300 uppercase" 
                  htmlFor="password"
                >
                  Password
                </label>
                <div className="text-xs">
                  <Link href="#" className="font-semibold text-emerald-400 hover:text-emerald-300 transition-colors">
                    Forgot password?
                  </Link>
                </div>
              </div>
              <div className="mt-1 relative group">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500 group-focus-within:text-primary">
                  <Lock size={18} />
                </span>
                <input 
                  id="password" 
                  name="password" 
                  type={showPassword ? 'text' : 'password'} 
                  autoComplete="current-password" 
                  required 
                  placeholder="••••••••" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full rounded-2xl border border-slate-800/80 bg-slate-900/70 py-3 pl-10 pr-10 text-sm text-slate-100 shadow-[0_0_0_1px_rgba(15,23,42,0.7)] outline-none ring-1 ring-transparent placeholder:text-slate-500 transition-all duration-200 group-hover:border-slate-600 group-hover:shadow-[0_0_0_1px_rgba(30,64,175,0.7),0_18px_45px_rgba(15,23,42,0.85)] focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/60 focus:shadow-[0_0_0_1px_rgba(45,212,191,0.9),0_20px_60px_rgba(5,46,22,0.9)]" 
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 group/password-toggle"
                >
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={showPassword ? 'hide' : 'show'}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 0.15 }}
                    >
                      {showPassword ? (
                        <EyeOff className="text-slate-400 group-hover/password-toggle:text-emerald-400 transition-colors" size={20} />
                      ) : (
                        <Eye className="text-slate-400 group-hover/password-toggle:text-emerald-400 transition-colors" size={20} />
                      )}
                    </motion.div>
                  </AnimatePresence>
                </button>
              </div>
            </div>

            <motion.div
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <button 
                type="submit" 
              className="relative flex w-full justify-center overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 px-3 py-3 text-sm font-semibold leading-6 text-slate-950 shadow-[0_18px_45px_rgba(34,197,94,0.65)] transition-all duration-200 mt-3 hover:shadow-[0_22px_70px_rgba(34,197,94,0.8)] focus-visible:outline-none active:scale-[0.99]"
              >
              <span className="absolute inset-0 bg-gradient-to-r from-white/20/30 via-transparent to-white/10 opacity-0 transition-opacity duration-200 hover:opacity-100" />
              <span className="relative">Sign in</span>
              </button>
            </motion.div>
          </motion.form>

          {error && (
            <motion.p 
              variants={itemVariants} 
              className="mt-4 text-sm text-red-400 bg-red-950/40 border border-red-900/60 rounded-xl px-3 py-2"
            >
              {error}
            </motion.p>
          )}

          {/* Divider */}
          <motion.p variants={itemVariants} className="mt-8 text-center text-xs text-slate-500">
            Don't have an account?{' '}
            <Link href="#" className="font-semibold leading-6 text-emerald-400 hover:text-emerald-300 transition-colors">
              Start a 14-day free trial
            </Link>
          </motion.p>
        </motion.div>
      </div>

      {/* Right Side: Brand Image / Decorative */}
      <div className="relative hidden w-0 flex-1 lg:block bg-navy-charcoal overflow-hidden group">
        
        {/* Background Image with Overlay */}
        <div className="absolute inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-br from-navy-charcoal/80 to-primary/40 mix-blend-multiply z-10 opacity-70 transition-opacity duration-1000 group-hover:opacity-60"></div>
          <Image 
            src="/crm-bg.png" 
            alt="Modern business dashboard CRM interface" 
            fill
            className="object-cover transition-transform duration-[10000ms] ease-linear group-hover:scale-110"
            priority
          />
        </div>

        {/* Floating Decorative Element (Glassmorphism) */}
        <motion.div 
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5, ease: 'easeOut' }}
          className="absolute bottom-20 left-20 right-20 z-20 rounded-2xl bg-white/10 p-8 backdrop-blur-xl border border-white/20 shadow-2xl"
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <motion.div 
                animate={{ 
                  boxShadow: ['0px 0px 0px 0px rgba(20, 184, 166, 0)', '0px 0px 0px 10px rgba(20, 184, 166, 0.2)', '0px 0px 0px 0px rgba(20, 184, 166, 0)']
                }}
                transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                className="size-12 rounded-full bg-primary/20 flex items-center justify-center border border-primary/30"
              >
                <TrendingUp className="text-primary" size={24} />
              </motion.div>
              <div>
                <h3 className="text-white font-bold text-lg leading-tight">Scale your sales pipeline</h3>
                <p className="text-slate-300 text-sm mt-1">Centralize your customer relationships and close deals faster with our integrated CRM tools.</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Geometric Pattern Overlays */}
        <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
          <svg className="h-full w-full opacity-50" fill="none" preserveAspectRatio="none" viewBox="0 0 100 100">
            <motion.circle 
              initial={{ pathLength: 0, rotate: 0 }}
              animate={{ pathLength: 1, rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
              className="stroke-primary origin-center" cx="100" cy="0" r="80" strokeWidth="0.5" strokeDasharray="2 4"
            />
            <motion.circle 
              className="stroke-primary" cx="100" cy="0" r="60" strokeWidth="0.5" 
            />
            <motion.circle 
              initial={{ pathLength: 0, rotate: 0 }}
              animate={{ pathLength: 1, rotate: -360 }}
              transition={{ duration: 25, repeat: Infinity, ease: 'linear' }}
              className="stroke-primary origin-center" cx="100" cy="0" r="40" strokeWidth="0.5" strokeDasharray="1 3"
            />
            <motion.circle 
              className="stroke-primary" cx="100" cy="0" r="20" strokeWidth="0.5" 
            />
          </svg>
        </div>
      </div>

    </div>
  );
}

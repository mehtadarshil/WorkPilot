'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import { Users, Package, UserCircle, Briefcase, UserCog, FileText, Settings, Quote, Award } from 'lucide-react';

interface StoredUser {
  id: number;
  email: string;
  role: 'SUPER_ADMIN' | 'ADMIN';
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<StoredUser | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const token = window.localStorage.getItem('wp_token');
    const userJson = window.localStorage.getItem('wp_user');
    if (!token || !userJson) {
      router.replace('/login');
      return;
    }
    try {
      setUser(JSON.parse(userJson) as StoredUser);
    } catch {
      router.replace('/login');
    }
  }, [router]);

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('wp_token');
      window.localStorage.removeItem('wp_user');
    }
    router.replace('/login');
  };

  if (user === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f6f8f8]">
        <div className="text-slate-500">Loading…</div>
      </div>
    );
  }

  return (
    <div id="wp-dashboard-root" className="flex h-screen flex-col overflow-hidden bg-[#f6f8f8] font-display text-slate-900">
      {/* Top Navbar */}
      <header className="flex w-full flex-col shrink-0 border-b border-slate-200 bg-white">
        <div className="flex items-center justify-between px-6 py-3">
          {/* Logo & Branding */}
          <div className="flex items-center gap-3">
            <div className="relative size-10 shrink-0 overflow-hidden rounded-lg">
              <Image src="/logo.jpg" alt="WorkPilot" fill className="object-contain" />
            </div>
            <div className="flex flex-col">
              <h1 className="text-base font-bold leading-tight text-slate-900">
                WorkPilot CRM
              </h1>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
                {user.role === 'SUPER_ADMIN' ? 'Super Admin' : 'Admin'}
              </p>
            </div>
          </div>

          {/* User Profile & Actions */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-1.5 border border-slate-100">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#14B8A6] text-white text-sm font-semibold">
                {user.email.charAt(0).toUpperCase()}
              </div>
              <div className="hidden lg:flex flex-col">
                <p className="truncate text-sm font-semibold text-slate-900 leading-none">
                  {user.email.split('@')[0].replace(/[._]/g, ' ')}
                </p>
                <p className="truncate text-[10px] text-slate-500 mt-1">{user.email}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>

        {/* Navigation Modules */}
        <div className="border-t border-slate-100 px-6">
          <nav className="flex items-center gap-1 overflow-x-auto py-2 scrollbar-none">
            {user.role === 'SUPER_ADMIN' && (
              <Link
                href="/dashboard/clients"
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors whitespace-nowrap ${
                  pathname === '/dashboard/clients'
                    ? 'bg-[#14B8A6]/10 text-[#14B8A6]'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Users className="size-4" />
                Clients
              </Link>
            )}
            {user.role === 'SUPER_ADMIN' && (
              <Link
                href="/dashboard/service-plans"
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors whitespace-nowrap ${
                  pathname === '/dashboard/service-plans'
                    ? 'bg-[#14B8A6]/10 text-[#14B8A6]'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Package className="size-4" />
                Service Plans
              </Link>
            )}
            <Link
              href="/dashboard/customers"
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors whitespace-nowrap ${
                pathname === '/dashboard/customers'
                  ? 'bg-[#14B8A6]/10 text-[#14B8A6]'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <UserCircle className="size-4" />
              Customers
            </Link>
            <Link
              href="/dashboard/certifications"
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors whitespace-nowrap ${
                pathname.startsWith('/dashboard/certifications')
                  ? 'bg-[#14B8A6]/10 text-[#14B8A6]'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Award className="size-4" />
              Certifications
            </Link>
            <Link
              href="/dashboard/jobs"
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors whitespace-nowrap ${
                pathname === '/dashboard/jobs'
                  ? 'bg-[#14B8A6]/10 text-[#14B8A6]'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Briefcase className="size-4" />
              Jobs
            </Link>
            <Link
              href="/dashboard/invoices"
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors whitespace-nowrap ${
                pathname.startsWith('/dashboard/invoices')
                  ? 'bg-[#14B8A6]/10 text-[#14B8A6]'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <FileText className="size-4" />
              Invoices
            </Link>
            <Link
              href="/dashboard/quotations"
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors whitespace-nowrap ${
                pathname.startsWith('/dashboard/quotations')
                  ? 'bg-[#14B8A6]/10 text-[#14B8A6]'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Quote className="size-4" />
              Quotations
            </Link>
            <Link
              href="/dashboard/settings"
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors whitespace-nowrap ${
                pathname === '/dashboard/settings'
                  ? 'bg-[#14B8A6]/10 text-[#14B8A6]'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Settings className="size-4" />
              Settings
            </Link>
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex flex-1 flex-col overflow-y-auto overflow-x-hidden">
        {children}
      </main>
    </div>
  );
}

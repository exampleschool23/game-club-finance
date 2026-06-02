'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import {
  LayoutDashboard, PlusCircle, MinusCircle, FileText,
  BarChart2, Wallet, Users, LogOut, X, Gamepad2
} from 'lucide-react';
import type { UserRole } from '@/types';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';

interface SidebarProps {
  role: UserRole;
  fullName: string;
  mobileOpen?: boolean;
  onClose?: () => void;
}

function NavLink({
  href, icon: Icon, label, active, onClick
}: {
  href: string; icon: React.ElementType; label: string; active: boolean; onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
        active
          ? 'bg-primary-600 text-white'
          : 'text-slate-300 hover:bg-slate-700 hover:text-white'
      )}
    >
      <Icon size={18} />
      <span>{label}</span>
    </Link>
  );
}

export function Sidebar({ role, fullName, mobileOpen, onClose }: SidebarProps) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  }

  const links = [
    { href: '/', icon: LayoutDashboard, label: t('dashboard'), roles: ['owner', 'admin', 'cashier'] },
    { href: '/income', icon: PlusCircle, label: t('income'), roles: ['owner', 'admin', 'cashier'] },
    { href: '/expense', icon: MinusCircle, label: t('expense'), roles: ['owner', 'admin'] },
    { href: '/daily-report', icon: FileText, label: t('dailyReport'), roles: ['owner', 'admin', 'cashier'] },
    { href: '/monthly-report', icon: BarChart2, label: t('monthlyReport'), roles: ['owner', 'admin'] },
    { href: '/balance', icon: Wallet, label: t('balance'), roles: ['owner', 'admin'] },
    { href: '/debts', icon: Users, label: t('debts'), roles: ['owner', 'admin', 'cashier'] },
  ].filter((l) => l.roles.includes(role));

  const content = (
    <div className="flex flex-col h-full bg-sidebar">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-5 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <Gamepad2 size={22} className="text-primary-400" />
          <span className="text-white font-bold text-lg">GameClub</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-slate-400 hover:text-white lg:hidden">
            <X size={20} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {links.map((link) => (
          <NavLink
            key={link.href}
            href={link.href}
            icon={link.icon}
            label={link.label}
            active={pathname === link.href}
            onClick={onClose}
          />
        ))}
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-slate-700 space-y-3">
        <div className="px-3">
          <LanguageSwitcher />
        </div>
        <div className="px-3">
          <p className="text-xs text-slate-400">{fullName}</p>
          <p className="text-xs text-slate-500 capitalize">{role}</p>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-slate-300
                     hover:bg-slate-700 hover:text-white transition-all w-full"
        >
          <LogOut size={18} />
          <span>{t('logout')}</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:w-56 xl:w-64 flex-shrink-0 h-screen sticky top-0">
        {content}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={onClose} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 z-50">
            {content}
          </aside>
        </div>
      )}
    </>
  );
}

'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import {
  LayoutDashboard,
  Wallet,
  Package,
  ShoppingCart,
  Users,
  LogOut,
  X,
  Gamepad2,
  MinusCircle,
  Archive,
  Settings,
  Shield,
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
  href,
  icon: Icon,
  label,
  active,
  onClick,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
        active
          ? 'bg-primary-600 text-white shadow-sm'
          : 'text-slate-300 hover:bg-white/10 hover:text-white',
      )}
    >
      <Icon size={18} className={active ? 'text-white' : 'text-slate-400'} />
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
    {
      href: '/',
      icon: LayoutDashboard,
      label: t('dashboard'),
      roles: ['owner', 'admin', 'viewer'],
    },
    {
      href: '/daily-cash',
      icon: Wallet,
      label: t('dailyCash'),
      roles: ['owner', 'admin'],
    },
    {
      href: '/closing-stock',
      icon: Archive,
      label: t('closingStock'),
      roles: ['owner', 'admin'],
    },
    {
      href: '/stock-purchase',
      icon: ShoppingCart,
      label: t('stockPurchase'),
      roles: ['owner', 'admin'],
    },
    {
      href: '/expenses',
      icon: MinusCircle,
      label: t('expenses'),
      roles: ['owner', 'admin'],
    },
    {
      href: '/debts',
      icon: Users,
      label: t('debts'),
      roles: ['owner', 'admin', 'viewer'],
    },
    {
      href: '/products',
      icon: Package,
      label: t('inventory'),
      roles: ['owner', 'admin'],
    },
    {
      href: '/team',
      icon: Shield,
      label: t('team'),
      roles: ['owner'],
    },
    {
      href: '/settings',
      icon: Settings,
      label: t('settings'),
      roles: ['owner', 'admin', 'viewer'],
    },
  ].filter((l) => l.roles.includes(role));

  const initials = fullName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const content = (
    <div className="flex flex-col h-full bg-sidebar">
      {/* Logo */}
      <div className="flex items-center justify-between px-4 py-5 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-primary-600 rounded-xl flex items-center justify-center flex-shrink-0">
            <Gamepad2 size={20} className="text-white" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-white font-bold text-base tracking-wide">GAME CLUB</span>
            <span className="text-primary-400 font-semibold text-xs tracking-wider">FINANCE</span>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-slate-400 hover:text-white lg:hidden">
            <X size={20} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
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
      <div className="px-3 py-4 border-t border-white/10 space-y-3">
        {/* Language switcher */}
        <div className="px-1">
          <LanguageSwitcher variant="dark" />
        </div>

        {/* User profile card */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl
                     hover:bg-white/10 transition-all group"
        >
          <div className="w-9 h-9 rounded-full bg-primary-600 flex items-center justify-center
                          text-white text-sm font-bold flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0 text-left">
            <p className="text-white text-sm font-medium truncate">{fullName}</p>
            <p className="text-slate-400 text-xs capitalize">{role}</p>
          </div>
          <LogOut size={16} className="text-slate-400 group-hover:text-white flex-shrink-0" />
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
          <aside className="absolute left-0 top-0 bottom-0 w-64 z-50">{content}</aside>
        </div>
      )}
    </>
  );
}

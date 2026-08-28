'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { MouseEvent } from 'react';
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
  Building2,
  ChevronDown,
  Archive,
  Settings,
  Shield,
  CircleDollarSign,
  BarChart3,
} from 'lucide-react';
import type { Club, UserRole } from '@/types';
import { canAccessFeature, type FeatureKey } from '@/lib/permissions';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';

interface SidebarClubOption {
  club: Club;
  role: UserRole;
}

interface SidebarProps {
  role: UserRole;
  fullName: string;
  memberships?: SidebarClubOption[];
  selectedClubId?: string;
  onSelectClub?: (clubId: string) => void;
  mobileOpen?: boolean;
  activePathname?: string;
  featureAccess?: FeatureKey[];
  onClose?: () => void;
  onNavigate?: (href: string) => void;
}

function NavLink({
  href,
  icon: Icon,
  label,
  active,
  onNavigate,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  active: boolean;
  onNavigate?: (href: string) => void;
}) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.altKey ||
      event.ctrlKey ||
      event.shiftKey
    ) {
      return;
    }

    onNavigate?.(href);
  }

  return (
    <Link
      href={href}
      onClick={handleClick}
      aria-current={active ? 'page' : undefined}
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

export function Sidebar({
  role,
  fullName,
  memberships = [],
  selectedClubId = '',
  onSelectClub,
  mobileOpen,
  activePathname,
  featureAccess = [],
  onClose,
  onNavigate,
}: SidebarProps) {
  const t = useTranslations('nav');
  const currentPathname = usePathname();
  const pathname = activePathname ?? currentPathname;
  const router = useRouter();
  const selectedClub = memberships.find((membership) => membership.club.id === selectedClubId)?.club ?? null;

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
      feature: 'dashboard' as FeatureKey,
    },
    {
      href: '/daily-cash',
      icon: Wallet,
      label: t('dailyCash'),
      feature: 'daily_cash' as FeatureKey,
    },
    {
      href: '/closing-stock',
      icon: Archive,
      label: t('closingStock'),
      feature: 'closing_stock' as FeatureKey,
    },
    {
      href: '/stock-purchase',
      icon: ShoppingCart,
      label: t('stockPurchase'),
      feature: 'stock_purchase' as FeatureKey,
    },
    {
      href: '/reports',
      icon: BarChart3,
      label: t('reports'),
      feature: 'reports' as FeatureKey,
    },
    {
      href: '/money-taken',
      icon: CircleDollarSign,
      label: t('moneyTaken'),
      feature: 'owner_profit' as FeatureKey,
    },
    {
      href: '/debts',
      icon: Users,
      label: t('debts'),
      feature: 'debts' as FeatureKey,
    },
    {
      href: '/products',
      icon: Package,
      label: t('inventory'),
      feature: 'inventory' as FeatureKey,
    },
    {
      href: '/team',
      icon: Shield,
      label: t('team'),
      feature: 'team' as FeatureKey,
    },
    {
      href: '/settings',
      icon: Settings,
      label: t('settings'),
      feature: 'settings' as FeatureKey,
    },
  ].filter((link) => (
    link.href === '/reports'
      ? canAccessFeature(role, featureAccess, 'reports') || canAccessFeature(role, featureAccess, 'expenses')
      : canAccessFeature(role, featureAccess, link.feature)
  ));

  const initials = fullName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const content = (
    <div className="flex flex-col h-full bg-sidebar">
      {/* Logo */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-white/15 bg-primary-600 shadow-sm shadow-primary-900/30">
            <Gamepad2 size={23} className="text-white" />
          </div>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[15px] font-extrabold text-white">
              {selectedClub?.name ?? 'Game Club'}
            </p>
            <p className="truncate text-[13px] font-bold text-primary-100">
              Finance
            </p>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-slate-400 hover:text-white xl:hidden">
            <X size={20} />
          </button>
        )}
      </div>

      {memberships.length > 0 && (
        <div className="border-b border-white/10 px-3 py-3">
          <label className="relative flex h-11 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 text-sm font-semibold text-white">
            <Building2 size={17} className="shrink-0 text-primary-100" />
            <select
              className="min-w-0 flex-1 appearance-none bg-transparent pr-7 text-sm font-semibold text-white outline-none"
              value={selectedClubId}
              onChange={(event) => onSelectClub?.(event.target.value)}
              aria-label={t('club')}
            >
              {memberships.map((membership) => (
                <option key={membership.club.id} value={membership.club.id} className="text-gray-900">
                  {membership.club.name}
                </option>
              ))}
            </select>
            <ChevronDown size={16} className="pointer-events-none absolute right-3 text-slate-300" />
          </label>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {links.map((link) => (
          <NavLink
            key={link.href}
            href={link.href}
            icon={link.icon}
            label={link.label}
            active={pathname === link.href}
            onNavigate={onNavigate}
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
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 xl:flex">
        {content}
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 xl:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={onClose} />
          <aside className="absolute bottom-0 left-0 top-0 z-50 w-[min(18rem,86vw)]">{content}</aside>
        </div>
      )}
    </>
  );
}

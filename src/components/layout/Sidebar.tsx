'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { cn } from '@/lib/utils';
import { useSignOut } from './useSignOut';
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
  HandCoins,
} from 'lucide-react';
import type { Club, UserRole } from '@/types';
import { canAccessFeature, featureForPath, type FeatureKey } from '@/lib/permissions';
import { Avatar, IconButton, LanguageSwitcher } from '@/components/PresentationFoundation';
import { isTopModal, trapFocus, useModalLayer } from '@/components/PresentationFoundation/Modal';

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
  const [prefetchOnIntent, setPrefetchOnIntent] = useState(false);

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
      // The dashboard embeds live totals in its server response. Prefetching
      // that response could retain totals from before a subsequent edit.
      prefetch={href !== '/' && prefetchOnIntent}
      onClick={handleClick}
      onMouseEnter={() => setPrefetchOnIntent(true)}
      onFocus={() => setPrefetchOnIntent(true)}
      onTouchStart={() => setPrefetchOnIntent(true)}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400',
        active
          ? 'bg-primary-600 text-white shadow-sm'
          : 'text-slate-300 hover:bg-white/10 hover:text-white',
      )}
    >
      <Icon size={18} className={active ? 'text-white' : 'text-slate-400'} aria-hidden="true" />
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
  const tTeam = useTranslations('team');
  const currentPathname = usePathname();
  const pathname = activePathname ?? currentPathname;
  const { signOut, signingOut } = useSignOut();
  const selectedClub = memberships.find((membership) => membership.club.id === selectedClubId)?.club ?? null;
  // Highlight the section, not just the exact path: /salaries/employees/…,
  // /daily-report and the money-details pages all belong to a nav item.
  const activeFeature = featureForPath(pathname);

  const links = [
    { href: '/', icon: LayoutDashboard, label: t('dashboard'), feature: 'dashboard' as FeatureKey },
    { href: '/daily-cash', icon: Wallet, label: t('dailyCash'), feature: 'daily_cash' as FeatureKey },
    { href: '/closing-stock', icon: Archive, label: t('closingStock'), feature: 'closing_stock' as FeatureKey },
    { href: '/stock-purchase', icon: ShoppingCart, label: t('stockPurchase'), feature: 'stock_purchase' as FeatureKey },
    { href: '/reports', icon: BarChart3, label: t('reports'), feature: 'reports' as FeatureKey },
    { href: '/money-taken', icon: CircleDollarSign, label: t('moneyTaken'), feature: 'owner_profit' as FeatureKey },
    { href: '/debts', icon: Users, label: t('debts'), feature: 'debts' as FeatureKey },
    { href: '/products', icon: Package, label: t('products'), feature: 'inventory' as FeatureKey },
    { href: '/salaries', icon: HandCoins, label: t('salaries'), feature: 'salaries' as FeatureKey },
    { href: '/team', icon: Shield, label: t('team'), feature: 'team' as FeatureKey },
    { href: '/settings', icon: Settings, label: t('settings'), feature: 'settings' as FeatureKey },
  ].filter((link) => (
    link.href === '/reports'
      ? canAccessFeature(role, featureAccess, 'reports') || canAccessFeature(role, featureAccess, 'expenses')
      : link.feature === 'salaries' || canAccessFeature(role, featureAccess, link.feature)
  ));

  function isActive(link: (typeof links)[number]) {
    if (link.href === '/reports') return activeFeature === 'reports' || activeFeature === 'expenses';
    return activeFeature === link.feature;
  }

  const content = (
    <div className="flex h-full flex-col bg-sidebar">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-white/15 bg-primary-600 shadow-sm shadow-primary-900/30">
            <Gamepad2 size={23} className="text-white" aria-hidden="true" />
          </div>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[15px] font-extrabold text-white">
              {selectedClub?.name ?? t('appName')}
            </p>
            <p className="truncate text-[13px] font-bold text-primary-100">{t('appSubtitle')}</p>
          </div>
        </div>
        {onClose && (
          <IconButton
            variant="ghost"
            label={t('closeNavigation')}
            icon={<X size={20} />}
            onClick={onClose}
            className="text-slate-400 hover:bg-white/10 hover:text-white lg:hidden"
          />
        )}
      </div>

      {memberships.length > 0 && (
        <div className="border-b border-white/10 px-3 py-3">
          <label className="relative flex h-11 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 text-sm font-semibold text-white focus-within:ring-2 focus-within:ring-primary-400">
            <Building2 size={17} className="shrink-0 text-primary-100" aria-hidden="true" />
            <select
              className="h-full min-w-0 flex-1 cursor-pointer appearance-none bg-transparent pr-7 text-sm font-semibold text-white outline-none"
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
            <ChevronDown size={16} className="pointer-events-none absolute right-3 text-slate-300" aria-hidden="true" />
          </label>
        </div>
      )}

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4" aria-label={t('mainNavigation')}>
        {links.map((link) => (
          <NavLink
            key={link.href}
            href={link.href}
            icon={link.icon}
            label={link.label}
            active={isActive(link)}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      <div className="space-y-3 border-t border-white/10 px-3 py-4">
        <div className="px-1">
          <LanguageSwitcher variant="dark" />
        </div>

        <div className="flex items-center gap-3 rounded-xl px-3 py-2">
          <Avatar name={fullName} size="sm" className="bg-primary-600 text-white" />
          <div className="min-w-0 flex-1 text-left">
            <p className="truncate text-sm font-medium text-white">{fullName}</p>
            <p className="text-xs text-slate-400">{tTeam(`roles.${role}`)}</p>
          </div>
          <IconButton
            variant="ghost"
            label={t('signOut')}
            icon={<LogOut size={17} />}
            onClick={signOut}
            loading={signingOut}
            className="text-slate-400 hover:bg-white/10 hover:text-white"
          />
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:flex">{content}</aside>

      {mobileOpen && (
        <MobileDrawer label={t('mainNavigation')} onClose={onClose}>
          {content}
        </MobileDrawer>
      )}
    </>
  );
}

/**
 * Off-canvas navigation for phones and tablets: a real modal dialog (focus
 * moves in and is trapped, Escape closes, page behind doesn't scroll, focus
 * returns to the menu button).
 */
function MobileDrawer({ label, onClose, children }: { label: string; onClose?: () => void; children: React.ReactNode }) {
  const panelRef = useRef<HTMLElement>(null);
  const layerId = useModalLayer(true);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    (panel?.querySelector<HTMLElement>('[aria-current="page"]') ?? panel?.querySelector<HTMLElement>('a[href], button'))?.focus({ preventScroll: true });

    function onKeyDown(event: KeyboardEvent) {
      if (!isTopModal(layerId)) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }
      trapFocus(event, panelRef.current);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [layerId]);

  return (
    <div className="fixed inset-0 z-40 lg:hidden">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <aside
        ref={panelRef}
        id="mobile-nav"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="absolute bottom-0 left-0 top-0 z-50 w-[min(18rem,86vw)] outline-none"
      >
        {children}
      </aside>
    </div>
  );
}

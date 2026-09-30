import { cn } from '@/lib/utils';

export interface AvatarProps {
  /** Person or product name; the first letters of up to two words are shown. */
  name: string;
  size?: 'sm' | 'md' | 'lg';
  /** `primary` for people, `neutral` for products and other objects. */
  tone?: 'primary' | 'neutral';
  className?: string;
}

const sizeClasses = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
};

export function initialsOf(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  return words
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? '')
    .join('')
    .toUpperCase();
}

/** Initials badge for people and products. Decorative: the name is always shown next to it. */
export function Avatar({ name, size = 'md', tone = 'primary', className }: AvatarProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full font-bold',
        tone === 'primary' ? 'bg-primary-50 text-primary-700 ring-1 ring-inset ring-primary-100' : 'bg-gray-100 text-gray-600',
        sizeClasses[size],
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}

import Image from 'next/image';
import { cn } from '@/lib/utils';

export const DEFAULT_CLUB_LOGO = '/default-club.svg';

export interface ClubLogoProps {
  /** Club image URL; the default game-club image is shown when it is not set. */
  src?: string | null;
  size?: number;
  className?: string;
}

/** Decorative club badge: the club name is always shown next to it. */
export function ClubLogo({ src, size = 32, className }: ClubLogoProps) {
  return (
    <Image
      src={src || DEFAULT_CLUB_LOGO}
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      unoptimized
      className={cn('shrink-0 rounded-lg object-cover', className)}
    />
  );
}

import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const locale = cookieStore.get('locale')?.value ?? 'ru';
  return {
    locale,
    timeZone: 'Asia/Tashkent',
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});

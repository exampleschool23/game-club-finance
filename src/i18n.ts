import { getRequestConfig } from 'next-intl/server';
import { cookies } from 'next/headers';

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  // Russian is the default; an unknown or missing cookie never selects another language.
  const requested = cookieStore.get('locale')?.value;
  const locale = requested === 'uz' || requested === 'en' || requested === 'ru' ? requested : 'ru';
  return {
    locale,
    timeZone: 'Asia/Tashkent',
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});

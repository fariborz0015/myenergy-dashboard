import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { History } from '@/components/history/history';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('history');
  return { title: t('title') };
}

export default function HistoryPage() {
  return <History />;
}

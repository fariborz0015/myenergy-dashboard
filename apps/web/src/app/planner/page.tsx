import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Planner } from '@/components/planner/planner';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('planner');
  return { title: t('title') };
}

export default function PlannerPage() {
  return <Planner />;
}

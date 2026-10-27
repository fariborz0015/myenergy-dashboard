import {
  Coffee,
  Fan,
  Laptop,
  Lightbulb,
  Plane,
  Plug,
  Projector,
  Refrigerator,
  Router,
  Smartphone,
  Snowflake,
  Tv,
  Wind,
  type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  refrigerator: Refrigerator,
  laptop: Laptop,
  smartphone: Smartphone,
  wind: Wind,
  tv: Tv,
  router: Router,
  fan: Fan,
  snowflake: Snowflake,
  lightbulb: Lightbulb,
  coffee: Coffee,
  projector: Projector,
  plane: Plane,
};

export function ApplianceIcon({ name, className }: { name?: string | null; className?: string }) {
  const Icon = (name && ICONS[name]) || Plug;
  return <Icon className={className} />;
}

export const PRESET_ICON_KEYS = Object.keys(ICONS);

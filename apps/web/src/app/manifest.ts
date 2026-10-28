import type { MetadataRoute } from 'next';

/** Makes the dashboard installable as a desktop / Android app (opens in its own window). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'MyEnergy',
    short_name: 'MyEnergy',
    description: 'Live dashboard and control for the INFINITY 1000 power station over Bluetooth.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#060a13',
    theme_color: '#060a13',
    categories: ['utilities', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Dashboard', url: '/dashboard', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Planner', url: '/planner', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'History', url: '/history', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  };
}

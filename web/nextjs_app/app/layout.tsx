import type { Metadata, Viewport } from 'next';
import './globals.css';

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const metadata: Metadata = {
  title: 'KidsLoc App | Gestão de locações',
  description: 'Gestão inteligente para locadoras de brinquedos e eventos.',
  icons: {
    icon: `${basePath}/kidsloc-logo.jpg`,
    shortcut: `${basePath}/kidsloc-logo.jpg`,
    apple: `${basePath}/kidsloc-logo.jpg`,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}

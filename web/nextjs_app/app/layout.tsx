import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'KidsLoc App | Gestão de locações',
  description: 'Gestão inteligente para locadoras de brinquedos e eventos.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}

import type { NextConfig } from 'next';

// GitHub Pages publica este projeto no subdiretório /kidsloc-app.
// O fallback evita gerar links absolutos para /_next quando a variável
// NEXT_PUBLIC_BASE_PATH não estiver configurada nas variáveis do repositório.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '/kidsloc-app';

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  basePath,
  images: { unoptimized: true },
};

export default nextConfig;

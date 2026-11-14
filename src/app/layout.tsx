import type { Metadata } from 'next';
import './globals.css';
import { initializeSystemModules } from '@/modules/init';
import { getBrandingConfig } from '@/core/branding/theme.service';
import { DynamicFavicon } from '@/core/branding/DynamicFavicon';
import { DynamicDocumentTitle } from '@/core/branding/DynamicDocumentTitle';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  let appName = 'SaleFlow ERP';
  try {
    const config = await getBrandingConfig('SYSTEM');
    appName = config?.displayName?.trim() || 'SaleFlow ERP';
  } catch {}

  return {
    title: {
      default: appName,
      template: `%s | ${appName}`,
    },
    description: `${appName} — modern sales distribution, inventory, and business management software.`,
    applicationName: appName,
    appleWebApp: {
      title: appName,
    },
    openGraph: {
      siteName: appName,
      title: appName,
      description: `${appName} business management platform`,
    },
    twitter: {
      title: appName,
      description: `${appName} business management platform`,
    },
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  initializeSystemModules();

  let faviconUrl = '/api/branding/assets/favicon';
  let appName = 'SaleFlow ERP';
  let uiTheme = 'classic';
  try {
    const config = await getBrandingConfig('SYSTEM');
    appName = config?.displayName?.trim() || 'SaleFlow ERP';
    uiTheme = config?.uiTheme === 'modern' ? 'modern' : 'classic';
    const version = config?.uploadedFaviconVersion || Date.now();
    faviconUrl = `/api/branding/assets/favicon?v=${version}`;
  } catch {}

  return (
    <html lang="en" data-theme="light" data-ui-theme={uiTheme} suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href={faviconUrl} sizes="any" />
        <link rel="shortcut icon" href={faviconUrl} />
        <DynamicFavicon initialUrl={faviconUrl} />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var theme = localStorage.getItem('saleflow_theme') || 'light';
                document.documentElement.setAttribute('data-theme', theme);
                var savedUi = localStorage.getItem('saleflow_ui_theme');
                if (savedUi) {
                  document.documentElement.setAttribute('data-ui-theme', savedUi);
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body>
        <DynamicDocumentTitle initialAppName={appName} />
        {children}
      </body>
    </html>
  );
}


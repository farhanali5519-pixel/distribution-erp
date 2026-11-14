import React from 'react';
import { BrandingConfig, generateCssVariablesFromBranding } from './theme';

export interface ThemeStyleInjectorProps {
  config?: BrandingConfig | null;
}

/**
 * Server/Client Component that injects the active branding and typography
 * CSS custom properties into :root, ensuring seamless typography propagation
 * without client-side layout shift (CLS).
 */
export function ThemeStyleInjector({ config }: ThemeStyleInjectorProps) {
  if (!config) return null;
  const uiTheme = config.uiTheme === 'modern' ? 'modern' : 'classic';
  const css = generateCssVariablesFromBranding(config);
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `try{if(document.documentElement.getAttribute('data-ui-theme')!=='${uiTheme}'){document.documentElement.setAttribute('data-ui-theme','${uiTheme}');}}catch(e){}`,
        }}
      />
      <style
        id="saleflow-theme-vars"
        dangerouslySetInnerHTML={{
          __html: `:root { ${css} }`,
        }}
      />
    </>
  );
}

export default ThemeStyleInjector;

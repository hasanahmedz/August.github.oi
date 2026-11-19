import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Google Maps Platform Two-Tier Quota Defense (Tier 1)
if (typeof window !== 'undefined') {
  const win = window as unknown as {
    gm_authFailure?: () => void;
    __gmpConsolePatched?: boolean;
  };
  win.gm_authFailure = () => {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  };
  if (!win.__gmpConsolePatched) {
    win.__gmpConsolePatched = true;
    const origError = console.error.bind(console);
    console.error = (...args: unknown[]) => {
      try {
        const joined = args.map((a) => String(a ?? '')).join(' ');
        if (
          joined.includes('OverQuotaMapError') ||
          joined.includes('QuotaExceededError') ||
          joined.includes('RESOURCE_EXHAUSTED')
        ) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
      } catch {
        // ignore console inspection errors
      }
      origError(...args);
    };
  }
}

createRoot(document.getElementById('root')!).render(<App />);

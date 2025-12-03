import './globals.css';
import type { Metadata } from 'next';
import { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Codex Remote Runner',
  description: 'Run Codex CLI tasks remotely and stream results in real time.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <main className="app-main">{children}</main>
        </div>
      </body>
    </html>
  );
}

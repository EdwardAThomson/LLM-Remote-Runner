'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { checkSession } from '../lib/auth';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const router = useRouter();

  useEffect(() => {
    async function verify() {
      const session = await checkSession();
      
      if (!session) {
        router.push('/login');
      } else {
        setIsAuthenticated(true);
      }
    }

    verify();
  }, [router]);

  // Show loading state while checking authentication
  if (isAuthenticated === null) {
    return (
      <div className="app-shell">
        <div className="app-main" style={{ textAlign: 'center', padding: '4rem' }}>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  // Only render children if authenticated
  return isAuthenticated ? <>{children}</> : null;
}

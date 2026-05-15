import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { checkSession } from '../lib/auth';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    async function verify() {
      const session = await checkSession();
      if (!session) {
        navigate('/login', { replace: true });
      } else {
        setIsAuthenticated(true);
      }
    }
    verify();
  }, [navigate]);

  if (isAuthenticated === null) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem' }}>
        <p>Loading...</p>
      </div>
    );
  }

  return isAuthenticated ? <>{children}</> : null;
}

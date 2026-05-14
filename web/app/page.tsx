import AuthGuard from '../components/AuthGuard';
import Dashboard from '../components/Dashboard';

export default function HomePage() {
  return (
    <AuthGuard>
      <Dashboard />
    </AuthGuard>
  );
}

import AuthGuard from '../../../components/AuthGuard';
import TokensSettings from '../../../components/TokensSettings';

export const dynamic = 'force-dynamic';

export default function TokensSettingsPage() {
  return (
    <AuthGuard>
      <TokensSettings />
    </AuthGuard>
  );
}

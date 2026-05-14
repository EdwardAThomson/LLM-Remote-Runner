import AuthGuard from '../../../components/AuthGuard';
import TaskConsole from '../../../components/TaskConsole';

export const dynamic = 'force-dynamic';

export default function NewTaskPage() {
  return (
    <AuthGuard>
      <TaskConsole />
    </AuthGuard>
  );
}

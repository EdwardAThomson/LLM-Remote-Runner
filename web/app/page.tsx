import AuthGuard from '../components/AuthGuard';
import TaskConsole from '../components/TaskConsole';

export default function HomePage() {
  return (
    <AuthGuard>
      <TaskConsole />
    </AuthGuard>
  );
}

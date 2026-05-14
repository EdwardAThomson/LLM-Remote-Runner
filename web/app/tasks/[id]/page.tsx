import AuthGuard from '../../../components/AuthGuard';
import TaskDetailView from '../../../components/TaskDetail';

export default function TaskDetailPage({ params }: { params: { id: string } }) {
  return (
    <AuthGuard>
      <TaskDetailView taskId={params.id} />
    </AuthGuard>
  );
}

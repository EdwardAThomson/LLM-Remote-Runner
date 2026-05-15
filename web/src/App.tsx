import { Route, Routes, useParams } from 'react-router-dom';
import AuthGuard from '../components/AuthGuard';
import Dashboard from '../components/Dashboard';
import LoginPage from '../components/LoginPage';
import TaskConsole from '../components/TaskConsole';
import TaskDetailView from '../components/TaskDetail';
import TokensSettings from '../components/TokensSettings';

function TaskDetailRoute() {
  const { id } = useParams<{ id: string }>();
  if (!id) return null;
  return <TaskDetailView taskId={id} />;
}

export default function App() {
  return (
    <div className="app-shell">
      <main className="app-main">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <AuthGuard>
                <Dashboard />
              </AuthGuard>
            }
          />
          <Route
            path="/tasks/new"
            element={
              <AuthGuard>
                <TaskConsole />
              </AuthGuard>
            }
          />
          <Route
            path="/tasks/:id"
            element={
              <AuthGuard>
                <TaskDetailRoute />
              </AuthGuard>
            }
          />
          <Route
            path="/settings/tokens"
            element={
              <AuthGuard>
                <TokensSettings />
              </AuthGuard>
            }
          />
        </Routes>
      </main>
    </div>
  );
}

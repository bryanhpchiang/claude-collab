import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { ClerkProvider } from '@clerk/clerk-react';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import { resolveClerkPublishableKey } from './config';
import './styles/global.css';

function ClerkWithRoutes() {
  const navigate = useNavigate();
  return (
    <ClerkProvider
      publishableKey={resolveClerkPublishableKey(
        import.meta.env as { VITE_CLERK_PUBLISHABLE_KEY?: string },
      )}
      routerPush={(to: string) => navigate(to)}
      routerReplace={(to: string) => navigate(to, { replace: true })}
    >
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/app" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </ClerkProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ClerkWithRoutes />
    </BrowserRouter>
  );
}

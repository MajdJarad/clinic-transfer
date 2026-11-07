import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import { AdminLayout } from './components/AdminLayout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { CalendarPage } from './pages/CalendarPage';
import { Trips } from './pages/Trips';
import { MapPage } from './pages/MapPage';
import { Tracking } from './pages/Tracking';
import { Drivers } from './pages/Drivers';
import { Vehicles } from './pages/Vehicles';
import { MaintenancePage } from './pages/Maintenance';
import { Administration } from './pages/Administration';
import { Alerts } from './pages/Alerts';
import { DriverApp } from './pages/DriverApp';
import { UpdateBanner } from './features/update/UpdateBanner';

function AppRoutes() {
  const { user } = useAuth();

  if (!user) return <Login />;

  if (user.role === 'DRIVER') return <DriverApp />;

  return (
    <AdminLayout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/trips" element={<CalendarPage />} />
        <Route path="/trips-list" element={<Trips />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/tracking" element={<Tracking />} />
        <Route path="/alerts" element={<Alerts />} />
        <Route path="/drivers" element={<Drivers />} />
        <Route path="/vehicles" element={<Vehicles />} />
        <Route path="/maintenance" element={<MaintenancePage />} />
        {user.role === 'ADMIN' && <Route path="/admin" element={<Administration />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AdminLayout>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <UpdateBanner />
      </AuthProvider>
    </BrowserRouter>
  );
}

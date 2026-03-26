import { Navigate, Route, Routes } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import AdminLayout from "./layouts/AdminLayout";
import EmployeeLayout from "./layouts/EmployeeLayout";
import AdminOverviewPage from "./pages/admin/AdminOverviewPage";
import AdminMonitoringPage from "./pages/admin/AdminMonitoringPage";
import AdminAnalyticsPage from "./pages/admin/AdminAnalyticsPage";
import AdminDetectionsPage from "./pages/admin/AdminDetectionsPage";
import AdminRoleMisusePage from "./pages/admin/AdminRoleMisusePage";
import AdminEmployeesPage from "./pages/admin/AdminEmployeesPage";
import EmployeeProfilePage from "./pages/employee/EmployeeProfilePage";
import EmployeeDocumentsPage from "./pages/employee/EmployeeDocumentsPage";
import EmployeeActivityPage from "./pages/employee/EmployeeActivityPage";
import EmployeeNotificationsPage from "./pages/employee/EmployeeNotificationsPage";
import EmployeeSecureSharePage from "./pages/employee/EmployeeSecureSharePage";
import { useAuth } from "./services/AuthContext";

function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-cyber-accent">
        Loading Access Guard AI...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={user.role === "Admin" ? "/admin/overview" : "/employee/profile"} replace />;
  }

  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={["Admin"]}>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/admin/overview" replace />} />
        <Route path="overview" element={<AdminOverviewPage />} />
        <Route path="monitoring" element={<AdminMonitoringPage />} />
        <Route path="analytics" element={<AdminAnalyticsPage />} />
        <Route path="detections" element={<AdminDetectionsPage />} />
        <Route path="role-misuse" element={<AdminRoleMisusePage />} />
        <Route path="employees" element={<AdminEmployeesPage />} />
      </Route>
      <Route
        path="/employee"
        element={
          <ProtectedRoute allowedRoles={["Employee", "HR Manager"]}>
            <EmployeeLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/employee/profile" replace />} />
        <Route path="profile" element={<EmployeeProfilePage />} />
        <Route path="documents" element={<EmployeeDocumentsPage />} />
        <Route path="secure-share" element={<EmployeeSecureSharePage />} />
        <Route path="activity" element={<EmployeeActivityPage />} />
        <Route path="notifications" element={<EmployeeNotificationsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

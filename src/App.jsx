import {
  BrowserRouter,
  Routes,
  Route,
  Navigate
} from 'react-router-dom'

import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import AMLMonitoring from './pages/AMLMonitoring'
import ModulePlaceholder from './pages/ModulePlaceholder'
import CustomerKYC from './pages/CustomerKYC'
import AccessDenied from './pages/AccessDenied'

import ProtectedRoute from './components/ProtectedRoute'
import AppLayout from './components/AppLayout'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public pages */}
        <Route path="/login" element={<Login />} />
        <Route path="/access-denied" element={<AccessDenied />} />

        {/* Dashboard */}
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<Dashboard />} />
        </Route>

        {/* Customer KYC */}
        <Route
          element={
            <ProtectedRoute
              allowedRoles={['ADMIN', 'KYC_OFFICER', 'CUSTOMER']}
            />
          }
        >
          <Route element={<AppLayout />}>
            <Route
              path="/customer-kyc"
              element={<CustomerKYC />}
            />
          </Route>
        </Route>

        {/* Accounts & Assets */}
        <Route
          element={
            <ProtectedRoute allowedRoles={['ADMIN', 'CUSTOMER']} requireApprovedKyc />
          }
        >
          <Route element={<AppLayout />}>
            <Route
              path="/accounts-assets"
              element={<ModulePlaceholder />}
            />
          </Route>
        </Route>

        {/* Transactions */}
        <Route
          element={
            <ProtectedRoute allowedRoles={['ADMIN', 'CUSTOMER']} requireApprovedKyc />
          }
        >
          <Route element={<AppLayout />}>
            <Route
              path="/transactions"
              element={<ModulePlaceholder />}
            />
          </Route>
        </Route>

        {/* AML Monitoring */}
        <Route
          element={
            <ProtectedRoute
              allowedRoles={['ADMIN', 'AML_ANALYST']}
            />
          }
        >
          <Route
            path="/aml-monitoring"
            element={<AMLMonitoring />}
          />
        </Route>

        {/* Blockchain Risk */}
        <Route
          element={
            <ProtectedRoute
              allowedRoles={['ADMIN', 'AML_ANALYST']}
            />
          }
        >
          <Route element={<AppLayout />}>
            <Route
              path="/blockchain-risk"
              element={<ModulePlaceholder />}
            />
          </Route>
        </Route>

        {/* Default page */}
        <Route
          path="/"
          element={<Navigate to="/dashboard" replace />}
        />

        {/* Unknown pages */}
        <Route
          path="*"
          element={<Navigate to="/dashboard" replace />}
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App

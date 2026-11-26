import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function FullScreenMessage({ children }) {
  return (
    <main className="auth-message">
      {children}
    </main>
  )
}

function ProtectedRoute({ allowedRoles }) {
  const {
    user,
    profile,
    role,
    accountStatus,
    loading,
    profileLoading
  } = useAuth()

  const location = useLocation()
  const normalizedRole = String(role || '').toUpperCase()
  const normalizedStatus = String(accountStatus || '').toUpperCase()

  if (loading || profileLoading) {
    return (
      <FullScreenMessage>
        Checking authentication...
      </FullScreenMessage>
    )
  }

  if (!user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location }}
      />
    )
  }

  if (!profile) {
    return (
      <FullScreenMessage>
        User profile not found. Please contact the administrator.
      </FullScreenMessage>
    )
  }

  if (normalizedStatus !== 'ACTIVE') {
    return (
      <FullScreenMessage>
        Your account is inactive. Please contact the administrator.
      </FullScreenMessage>
    )
  }

  if (
    allowedRoles &&
    !allowedRoles.includes(normalizedRole)
  ) {
    return <Navigate to="/access-denied" replace />
  }

  return <Outlet />
}

export default ProtectedRoute
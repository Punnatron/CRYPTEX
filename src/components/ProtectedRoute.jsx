import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

function FullScreenMessage({ children }) {
  return (
    <main className="auth-message">
      {children}
    </main>
  )
}

function ProtectedRoute({ allowedRoles, requireApprovedKyc = false }) {
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
  const needsKycApproval = requireApprovedKyc && normalizedRole === 'CUSTOMER'
  const [kycAccess, setKycAccess] = useState({ loading: true, approved: false })

  useEffect(() => {
    let active = true

    async function checkKycAccess() {
      if (!needsKycApproval) {
        setKycAccess({ loading: false, approved: true })
        return
      }

      if (!profile?.user_id) {
        setKycAccess({ loading: false, approved: false })
        return
      }

      setKycAccess({ loading: true, approved: false })

      try {
        const { data: customer, error: customerError } = await supabase
          .from('customer_profiles')
          .select('customer_id')
          .eq('user_id', profile.user_id)
          .maybeSingle()

        if (customerError) throw customerError
        if (!customer) {
          if (active) setKycAccess({ loading: false, approved: false })
          return
        }

        const { data: verification, error: verificationError } = await supabase
          .from('kyc_verifications')
          .select('verification_status')
          .eq('customer_id', customer.customer_id)
          .maybeSingle()

        if (verificationError) throw verificationError

        if (active) {
          setKycAccess({
            loading: false,
            approved: String(verification?.verification_status || '').toUpperCase() === 'APPROVED'
          })
        }
      } catch (error) {
        console.error('KYC access check failed:', error.message)
        if (active) setKycAccess({ loading: false, approved: false })
      }
    }

    checkKycAccess()
    return () => { active = false }
  }, [needsKycApproval, profile?.user_id])

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

  if (needsKycApproval && kycAccess.loading) {
    return (
      <FullScreenMessage>
        Checking KYC approval...
      </FullScreenMessage>
    )
  }

  if (needsKycApproval && !kycAccess.approved) {
    return <Navigate to="/dashboard" replace />
  }

  return <Outlet />
}

export default ProtectedRoute
import { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

import {
  LayoutDashboard,
  Users,
  ArrowLeftRight,
  ShieldAlert,
  Blocks,
  Wallet,
  LogOut
} from 'lucide-react'

const MENU = [
  {
    label: 'Dashboard',
    path: '/dashboard',
    icon: LayoutDashboard,
    roles: ['ADMIN', 'KYC_OFFICER', 'AML_ANALYST', 'CUSTOMER']
  },
  {
    label: 'Customer KYC',
    path: '/customer-kyc',
    icon: Users,
    roles: ['ADMIN', 'KYC_OFFICER', 'CUSTOMER']
  },
  {
    label: 'Accounts & Assets',
    path: '/accounts-assets',
    icon: Wallet,
    roles: ['ADMIN', 'CUSTOMER']
  },
  {
    label: 'Transactions',
    path: '/transactions',
    icon: ArrowLeftRight,
    roles: ['ADMIN', 'CUSTOMER']
  },
  {
    label: 'AML Monitoring',
    path: '/aml-monitoring',
    icon: ShieldAlert,
    roles: ['ADMIN', 'AML_ANALYST']
  },
  {
    label: 'Blockchain Risk',
    path: '/blockchain-risk',
    icon: Blocks,
    roles: ['ADMIN', 'AML_ANALYST']
  }
]

export default function Sidebar() {
  const {
    user,
    profile,
    role,
    accountStatus,
    signOut
  } = useAuth()

  const navigate = useNavigate()
  const [customerKycApproved, setCustomerKycApproved] = useState(false)

  const normalizedRole = String(role || '').toUpperCase()

  useEffect(() => {
    let active = true

    async function loadCustomerKycStatus() {
      if (normalizedRole !== 'CUSTOMER' || !profile?.user_id) {
        setCustomerKycApproved(false)
        return
      }

      try {
        const { data: customer, error: customerError } = await supabase
          .from('customer_profiles')
          .select('customer_id')
          .eq('user_id', profile.user_id)
          .maybeSingle()
        if (customerError) throw customerError

        if (!customer) {
          if (active) setCustomerKycApproved(false)
          return
        }

        const { data: verification, error: verificationError } = await supabase
          .from('kyc_verifications')
          .select('verification_status')
          .eq('customer_id', customer.customer_id)
          .maybeSingle()
        if (verificationError) throw verificationError

        if (active) {
          setCustomerKycApproved(
            String(verification?.verification_status || '').toUpperCase() === 'APPROVED'
          )
        }
      } catch (error) {
        console.error('Unable to load customer KYC status for navigation:', error.message)
        if (active) setCustomerKycApproved(false)
      }
    }

    loadCustomerKycStatus()
    return () => { active = false }
  }, [normalizedRole, profile?.user_id])

  const displayName =
    profile?.full_name ||
    user?.user_metadata?.full_name ||
    user?.email?.split('@')[0] ||
    'User'

  const visibleMenu = MENU.filter(item => {
    if (!item.roles.includes(normalizedRole)) return false
    const isExchangeMenu = ['/accounts-assets', '/transactions'].includes(item.path)
    return normalizedRole !== 'CUSTOMER' || !isExchangeMenu || customerKycApproved
  })

  async function handleLogout() {
    const { error } = await signOut()

    if (error) {
      alert(`Logout failed: ${error.message}`)
      return
    }

    navigate('/login', { replace: true })
  }

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-icon">
          <Blocks size={23} />
        </div>

        <div>
          <h2>CRYPTEX</h2>
          <span>EXCHANGE MANAGEMENT</span>
        </div>
      </div>

      <div className="sidebar-label">MAIN MENU</div>

      <nav className="sidebar-nav">
        {visibleMenu.map(item => {
          const Icon = item.icon

          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/dashboard'}
              className={({ isActive }) =>
                `nav-item${isActive ? ' active' : ''}`
              }
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </NavLink>
          )
        })}
      </nav>

      <div className="sidebar-bottom">
        <div className="sidebar-user">
          <div className="user-avatar">
            {displayName.charAt(0).toUpperCase()}
          </div>

          <div className="user-info">
            <strong>{displayName}</strong>
            <span>{role || 'Role unavailable'}</span>
            <span>{accountStatus || user?.email || ''}</span>
          </div>
        </div>

        <button
          className="logout-button"
          onClick={handleLogout}
        >
          <LogOut size={17} />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  )
}

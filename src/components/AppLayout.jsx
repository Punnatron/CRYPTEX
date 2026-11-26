import { Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Sidebar from './Sidebar'
import { Blocks } from 'lucide-react'

const PAGE_TITLES = {
  '/customer-kyc': 'Customer KYC',
  '/accounts-assets': 'Accounts & Assets',
  '/transactions': 'Transactions',
  '/aml-monitoring': 'AML Monitoring',
  '/blockchain-risk': 'Blockchain Risk'
}

export default function AppLayout() {
  const { profile, role, user } = useAuth()
  const location = useLocation()

  const pageTitle =
    PAGE_TITLES[location.pathname] || 'CRYPTEX'

  const displayName =
    profile?.full_name ||
    user?.user_metadata?.full_name ||
    user?.email?.split('@')[0] ||
    'User'

  return (
    <div className="dashboard-layout">
      <Sidebar />

      <main className="dashboard-main">
        <header className="topbar">
          <div className="topbar-title">
            <span className="breadcrumb">
              CRYPTEX / MANAGEMENT
            </span>
            <h1>{pageTitle}</h1>
          </div>

          <div className="topbar-actions">
            <div className="system-status">
              <span className="status-dot" />
              System Online
            </div>

            <div className="topbar-avatar">
              {displayName.charAt(0).toUpperCase()}
            </div>
          </div>
        </header>

        <section className="content app-layout-content">
          <div className="app-page-user">
            <Blocks size={15} />
            <span>{displayName}</span>
            <span>·</span>
            <span>{role}</span>
          </div>

          <Outlet />
        </section>
      </main>
    </div>
  )
}

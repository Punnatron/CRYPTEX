
import Chatbot from '../components/Chatbot'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

import {
  LayoutDashboard,
  Users,
  ArrowLeftRight,
  ShieldAlert,
  Blocks,
  Wallet,
  LogOut,
  RefreshCw,
  TrendingUp,
  Activity,
  CircleAlert,
  Clock3,
  ShieldCheck
} from 'lucide-react'

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell
} from 'recharts'

const COLORS = ['#22c55e', '#eab308', '#f97316', '#ef4444']

const STAFF_ROLES = ['ADMIN', 'AML_ANALYST', 'KYC_OFFICER']
const AML_ROLES = ['ADMIN', 'AML_ANALYST']

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(value || 0)
}

function formatDate(value) {
  if (!value) return '-'

  return new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })
}

function formatDateTime(value) {
  if (!value) return '-'

  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function SidebarLink({ to, icon: Icon, children }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        `nav-item${isActive ? ' active' : ''}`
      }
    >
      <Icon size={18} />
      <span>{children}</span>
    </NavLink>
  )
}

function Dashboard() {
  const {
    user,
    profile,
    role: authRole,
    accountStatus: authAccountStatus,
    loading: authLoading,
    profileLoading,
    signOut
  } = useAuth()

  const role = String(
    authRole || profile?.role || ''
  ).trim().toUpperCase()

  const accountStatus = String(
    authAccountStatus || profile?.account_status || ''
  ).trim().toUpperCase()

  const canViewStaffDashboard = STAFF_ROLES.includes(role)
  const canViewAml = AML_ROLES.includes(role)

  const [kycData, setKycData] = useState([])
  const [riskData, setRiskData] = useState([])
  const [transactionData, setTransactionData] = useState([])
  const [amlData, setAmlData] = useState([])
  const [dailyData, setDailyData] = useState([])
  const [customerKyc, setCustomerKyc] = useState({ loading: true, status: 'NOT SUBMITTED', submittedAt: null, reason: null, error: '' })

  const [dataLoading, setDataLoading] = useState(false)
  const [error, setError] = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)

  const displayName =
    profile?.full_name ||
    user?.user_metadata?.full_name ||
    user?.email?.split('@')[0] ||
    'User'

  const loadDashboard = useCallback(async () => {
    if (
      authLoading ||
      profileLoading ||
      !user ||
      !profile ||
      !canViewStaffDashboard ||
      accountStatus !== 'ACTIVE'
    ) {
      setKycData([])
      setRiskData([])
      setTransactionData([])
      setAmlData([])
      setDailyData([])
      setDataLoading(false)
      return
    }

    setDataLoading(true)
    setError('')

    const requests = [
      supabase.from('v_customer_kyc_status').select('*'),
      supabase.from('v_customer_risk_summary').select('*'),
      supabase.from('v_transaction_history').select('*'),
      supabase.from('v_daily_transaction_summary').select('*')
    ]

    // Only ADMIN and AML_ANALYST can query AML dashboard data.
    if (canViewAml) {
      requests.push(
        supabase.from('v_aml_investigation_dashboard').select('*')
      )
    }

    const results = await Promise.all(requests)
    const failed = results.find(result => result.error)

    if (failed) {
      setError(failed.error.message)
      setDataLoading(false)
      return
    }

    setKycData(results[0].data || [])
    setRiskData(results[1].data || [])
    setTransactionData(results[2].data || [])
    setDailyData(results[3].data || [])
    setAmlData(canViewAml ? (results[4]?.data || []) : [])

    setLastUpdated(new Date())
    setDataLoading(false)
  }, [
    authLoading,
    profileLoading,
    user,
    profile,
    canViewStaffDashboard,
    canViewAml,
    accountStatus
  ])

  useEffect(() => {
    if (!authLoading && !profileLoading && profile) {
      loadDashboard()
    }
  }, [
    authLoading,
    profileLoading,
    profile,
    loadDashboard
  ])

  useEffect(() => {
    let active = true
    async function loadCustomerKyc() {
      if (role !== 'CUSTOMER' || !profile?.user_id) return
      setCustomerKyc(current => ({ ...current, loading: true, error: '' }))
      try {
        const { data: customer, error: customerError } = await supabase
          .from('customer_profiles')
          .select('customer_id, customer_status')
          .eq('user_id', profile.user_id)
          .maybeSingle()
        if (customerError) throw customerError
        if (!customer) {
          if (active) setCustomerKyc({ loading: false, status: 'NOT SUBMITTED', submittedAt: null, reason: null, error: '' })
          return
        }
        const { data: verification, error: verificationError } = await supabase
          .from('kyc_verifications')
          .select('verification_status, submitted_at, rejection_reason')
          .eq('customer_id', customer.customer_id)
          .maybeSingle()
        if (verificationError) throw verificationError
        let status = verification?.verification_status || 'NOT SUBMITTED'
        if (status === 'PENDING' && verification?.rejection_reason) status = 'MORE INFO REQUESTED'
        if (active) setCustomerKyc({ loading: false, status, submittedAt: verification?.submitted_at || null, reason: verification?.rejection_reason || null, error: '' })
      } catch (e) {
        if (active) setCustomerKyc({ loading: false, status: 'UNKNOWN', submittedAt: null, reason: null, error: e.message || 'Unable to load KYC status' })
      }
    }
    loadCustomerKyc()
    return () => { active = false }
  }, [role, profile?.user_id])

  async function handleLogout() {
    const { error: logoutError } = await signOut()

    if (logoutError) {
      alert('Logout failed: ' + logoutError.message)
    }
  }

  const uniqueCustomers = useMemo(
    () => new Set(kycData.map(item => item.customer_id)).size,
    [kycData]
  )

  const pendingKyc = useMemo(
    () =>
      kycData.filter(item =>
        ['PENDING', 'SUBMITTED', 'UNDER_REVIEW'].includes(
          String(item.verification_status || '').toUpperCase()
        )
      ).length,
    [kycData]
  )

  const criticalAlerts = useMemo(
    () =>
      amlData.filter(item =>
        ['HIGH', 'CRITICAL'].includes(
          String(item.severity || '').toUpperCase()
        )
      ).length,
    [amlData]
  )

  const riskDistribution = useMemo(
    () =>
      ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map(level => ({
        name: level,
        value: riskData.filter(
          item =>
            String(item.risk_level || '').toUpperCase() === level
        ).length
      })),
    [riskData]
  )

  const transactionChart = useMemo(() => {
    const grouped = {}

    dailyData.forEach(item => {
      const date = item.transaction_date

      if (!date) return

      if (!grouped[date]) {
        grouped[date] = {
          date,
          transactions: 0
        }
      }

      grouped[date].transactions += Number(
        item.transaction_count || 0
      )
    })

    return Object.values(grouped)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-14)
      .map(item => ({
        ...item,
        label: formatDate(item.date)
      }))
  }, [dailyData])

  const recentAlerts = useMemo(
    () =>
      [...amlData]
        .sort(
          (a, b) =>
            new Date(b.created_at) - new Date(a.created_at)
        )
        .slice(0, 5),
    [amlData]
  )

  const recentTransactions = useMemo(
    () =>
      [...transactionData]
        .sort(
          (a, b) =>
            new Date(b.initiated_at) - new Date(a.initiated_at)
        )
        .slice(0, 5),
    [transactionData]
  )

  // Authentication loading
  if (authLoading || profileLoading) {
    return (
      <div className="dashboard-layout">
        <main className="dashboard-main">
          <section className="content">
            <p>Loading your account and permissions...</p>
          </section>
        </main>
      </div>
    )
  }

  // No authenticated user
  if (!user) {
    return (
      <div className="dashboard-layout">
        <main className="dashboard-main">
          <section className="content">
            <h2>Session not found</h2>
            <p>Please sign in again.</p>
          </section>
        </main>
      </div>
    )
  }

  // Missing profile
  if (!profile) {
    return (
      <div className="dashboard-layout">
        <main className="dashboard-main">
          <section className="content">
            <h2>Unable to load your profile</h2>
            <p>
              Your account profile could not be verified.
              Please sign out and sign in again, or contact
              the administrator.
            </p>

            <button
              className="logout-button"
              onClick={handleLogout}
            >
              <LogOut size={17} />
              Sign Out
            </button>
          </section>
        </main>
      </div>
    )
  }

  // Inactive account
  if (accountStatus !== 'ACTIVE') {
    return (
      <div className="dashboard-layout">
        <main className="dashboard-main">
          <section className="content">
            <h2>Account unavailable</h2>
            <p>
              Your account status is {accountStatus || 'UNKNOWN'}.
              Please contact the administrator.
            </p>

            <button
              className="logout-button"
              onClick={handleLogout}
            >
              <LogOut size={17} />
              Sign Out
            </button>
          </section>
        </main>
      </div>
    )
  }

  // CUSTOMER dashboard
  if (!canViewStaffDashboard) {
    return (
      <div className="dashboard-layout">
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
            <SidebarLink
              to="/dashboard"
              icon={LayoutDashboard}
            >
              My Dashboard
            </SidebarLink>
          </nav>

          <div className="sidebar-bottom">
            <div className="sidebar-user">
              <div className="user-avatar">
                {displayName.charAt(0).toUpperCase()}
              </div>

              <div className="user-info">
                <strong>{displayName}</strong>
                <span>CUSTOMER</span>
                <span>ACTIVE</span>
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

        <main className="dashboard-main">
          <header className="topbar">
            <div className="topbar-title">
              <span className="breadcrumb">CUSTOMER PORTAL</span>
              <h1>My Dashboard</h1>
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

          <section className="content">
            <div className="welcome-row">
              <div>
                <h2>Welcome back, {displayName}</h2>
                <p>
                  View your account information and manage your
                  exchange activity.
                </p>
              </div>
            </div>

            <section className="stats-grid">
              <article className="stat-card">
                <div className="stat-top">
                  <span>Account Role</span>
                  <div className="stat-icon blue">
                    <Users size={19} />
                  </div>
                </div>

                <strong>CUSTOMER</strong>
                <small>Your platform access level</small>
              </article>

              <article className="stat-card">
                <div className="stat-top">
                  <span>Account Status</span>
                  <div className="stat-icon green">
                    <Activity size={19} />
                  </div>
                </div>

                <strong>ACTIVE</strong>
                <small>Your account is active</small>
              </article>
            </section>

            <article className="panel">
              <div className="panel-heading">
                <div>
                  <h3>Identity Verification (KYC)</h3>
                  <p>Your verification status determines access to exchange account and transaction services.</p>
                </div>
                <NavLink to="/customer-kyc" className="nav-item" style={{ display: 'inline-flex', width: 'auto' }}>
                  <ShieldCheck size={16} /> {customerKyc.status === 'APPROVED' ? 'View KYC' : 'Complete KYC'}
                </NavLink>
              </div>
              <div className="content">
                <p><strong>Status:</strong> <span style={{ fontWeight: 800, color: customerKyc.status === 'APPROVED' ? '#16a34a' : customerKyc.status === 'REJECTED' ? '#dc2626' : '#d97706' }}>{customerKyc.loading ? 'Loading…' : customerKyc.status}</span></p>
                {customerKyc.submittedAt && <p><strong>Last submitted:</strong> {formatDateTime(customerKyc.submittedAt)}</p>}
                {customerKyc.error && <p role="alert" style={{ color: '#dc2626' }}>{customerKyc.error}</p>}
                {customerKyc.status === 'APPROVED' ? (
                  <p style={{ color: '#15803d' }}>Your identity verification is approved. Your account is eligible for exchange data access, subject to the permissions assigned to your account.</p>
                ) : (
                  <p style={{ color: '#b45309' }}>Exchange account and transaction data remain restricted at the database level until your KYC application is approved. {customerKyc.status === 'REJECTED' ? 'You may correct your information and resubmit.' : customerKyc.status === 'MORE INFO REQUESTED' ? 'Please provide the additional information requested by the KYC officer.' : 'Submit your identity information to begin verification.'}</p>
                )}
              </div>
            </article>

            <article className="panel">
              <div className="panel-heading">
                <div>
                  <h3>My Profile</h3>
                  <p>Your registered account details</p>
                </div>
              </div>

              <div className="content">
                <p>
                  <strong>Name:</strong> {profile.full_name || '-'}
                </p>
                <p>
                  <strong>Email:</strong>{' '}
                  {profile.email || user.email || '-'}
                </p>
                <p>
                  <strong>Role:</strong> CUSTOMER
                </p>
                <p>
                  <strong>Status:</strong> ACTIVE
                </p>
              </div>
            </article>

            <footer className="dashboard-footer">
              <span>
                CRYPTEX Â· Digital Asset KYC, AML & Blockchain Monitoring
              </span>
              <span>Educational Database Project Â· AIE313</span>
            </footer>
          </section>
        </main>

        <Chatbot />
      </div>
    )
  }

  // STAFF DASHBOARD
  return (
    <div className="dashboard-layout">
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
  <SidebarLink
    to="/dashboard"
    icon={LayoutDashboard}
  >
    Dashboard
  </SidebarLink>

  {['ADMIN', 'KYC_OFFICER'].includes(role) && (
    <SidebarLink
      to="/customer-kyc"
      icon={Users}
    >
      Customer KYC
    </SidebarLink>
  )}

  {role === 'ADMIN' && (
    <SidebarLink
      to="/accounts-assets"
      icon={Wallet}
    >
      Accounts & Assets
    </SidebarLink>
  )}

  {role === 'ADMIN' && (
    <SidebarLink
      to="/transactions"
      icon={ArrowLeftRight}
    >
      Transactions
    </SidebarLink>
  )}

  {canViewAml && (
    <SidebarLink
      to="/aml-monitoring"
      icon={ShieldAlert}
    >
      AML Monitoring
    </SidebarLink>
  )}

  {canViewAml && (
    <SidebarLink
      to="/blockchain-risk"
      icon={Blocks}
    >
      Blockchain Risk
    </SidebarLink>
  )}
</nav>

        <div className="sidebar-bottom">
          <div className="sidebar-user">
            <div className="user-avatar">
              {displayName.charAt(0).toUpperCase()}
            </div>

            <div className="user-info">
              <strong>{displayName}</strong>
              <span>{role}</span>
              <span>{accountStatus}</span>
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

      <main className="dashboard-main">
        <header className="topbar">
          <div className="topbar-title">
            <span className="breadcrumb">OVERVIEW / DASHBOARD</span>
            <h1>Dashboard</h1>
          </div>

          <div className="topbar-actions">
            <div className="system-status">
              <span className="status-dot" />
              System Online
            </div>

            <button
              className="icon-button"
              onClick={loadDashboard}
              title="Refresh data"
              disabled={dataLoading}
            >
              <RefreshCw size={18} />
            </button>

            <div className="topbar-avatar">
              {displayName.charAt(0).toUpperCase()}
            </div>
          </div>
        </header>

        <section className="content">
          <div className="welcome-row">
            <div>
              <h2>Welcome back, {displayName}</h2>
              <p>
                Here's what's happening across your exchange today.
              </p>
            </div>

            <div className="updated-label">
              <Clock3 size={14} />
              {lastUpdated
                ? `Updated ${lastUpdated.toLocaleTimeString()}`
                : 'Loading data'}
            </div>
          </div>

          {error && (
            <div className="error-banner">
              <CircleAlert size={18} />

              <div>
                <strong>Unable to load dashboard data</strong>
                <p>{error}</p>
              </div>

              <button onClick={loadDashboard}>
                Retry
              </button>
            </div>
          )}

          <div className="section-heading">
            <div>
              <h3>Platform Overview</h3>
              <p>Key metrics from your database</p>
            </div>

            <span className="live-label">
              <span className="status-dot" />
              DATABASE CONNECTED
            </span>
          </div>

          <section className="stats-grid">
            <article className="stat-card">
              <div className="stat-top">
                <span>Total Customers</span>
                <div className="stat-icon blue">
                  <Users size={19} />
                </div>
              </div>

              <strong>
                {dataLoading ? 'â€”' : formatNumber(uniqueCustomers)}
              </strong>

              <small>Registered customers</small>
            </article>

            <article className="stat-card">
              <div className="stat-top">
                <span>Total Transactions</span>
                <div className="stat-icon purple">
                  <ArrowLeftRight size={19} />
                </div>
              </div>

              <strong>
                {dataLoading ? 'â€”' : formatNumber(transactionData.length)}
              </strong>

              <small>Transaction records</small>
            </article>

            {canViewAml && (
              <article className="stat-card">
                <div className="stat-top">
                  <span>AML Alerts</span>
                  <div className="stat-icon orange">
                    <ShieldAlert size={19} />
                  </div>
                </div>

                <strong>
                  {dataLoading ? 'â€”' : formatNumber(amlData.length)}
                </strong>

                <small>
                  {formatNumber(criticalAlerts)} High / Critical severity
                </small>
              </article>
            )}

            <article className="stat-card">
              <div className="stat-top">
                <span>Pending KYC</span>
                <div className="stat-icon green">
                  <Clock3 size={19} />
                </div>
              </div>

              <strong>
                {dataLoading ? 'â€”' : formatNumber(pendingKyc)}
              </strong>

              <small>Awaiting verification</small>
            </article>
          </section>

          <section className="charts-grid">
            <article className="panel transaction-panel">
              <div className="panel-heading">
                <div>
                  <h3>Transaction Activity</h3>
                  <p>Daily transaction volume Â· Last 14 dates</p>
                </div>

                <div className="panel-icon">
                  <TrendingUp size={18} />
                </div>
              </div>

              <div className="chart-area">
                {dataLoading ? (
                  <div className="chart-message">
                    Loading chart...
                  </div>
                ) : transactionChart.length === 0 ? (
                  <div className="chart-message">
                    No transaction data available
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={transactionChart}>
                      <defs>
                        <linearGradient
                          id="transactionGradient"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="0%"
                            stopColor="#3b82f6"
                            stopOpacity={0.35}
                          />
                          <stop
                            offset="95%"
                            stopColor="#3b82f6"
                            stopOpacity={0}
                          />
                        </linearGradient>
                      </defs>

                      <CartesianGrid
                        stroke="#253249"
                        strokeDasharray="3 3"
                        vertical={false}
                      />

                      <XAxis
                        dataKey="label"
                        stroke="#8290a5"
                        tick={{ fontSize: 10 }}
                        tickLine={false}
                        axisLine={false}
                      />

                      <YAxis
                        stroke="#8290a5"
                        tick={{ fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                      />

                      <Tooltip
                        contentStyle={{
                          background: '#172338',
                          border: '1px solid #334155',
                          borderRadius: 8,
                          color: '#f8fafc'
                        }}
                      />

                      <Area
                        type="monotone"
                        dataKey="transactions"
                        name="Transactions"
                        stroke="#3b82f6"
                        strokeWidth={2.5}
                        fill="url(#transactionGradient)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </article>

            <article className="panel risk-panel">
              <div className="panel-heading">
                <div>
                  <h3>Customer Risk Distribution</h3>
                  <p>Risk levels across customers</p>
                </div>

                <div className="panel-icon">
                  <Activity size={18} />
                </div>
              </div>

              <div className="risk-content">
                <div className="risk-chart">
                  {dataLoading ? (
                    <div className="chart-message">
                      Loading...
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={riskDistribution}
                          dataKey="value"
                          nameKey="name"
                          innerRadius="62%"
                          outerRadius="88%"
                          paddingAngle={4}
                          stroke="none"
                        >
                          {riskDistribution.map((entry, index) => (
                            <Cell
                              key={entry.name}
                              fill={COLORS[index]}
                            />
                          ))}
                        </Pie>

                        <Tooltip
                          contentStyle={{
                            background: '#172338',
                            border: '1px solid #334155',
                            borderRadius: 8,
                            color: '#f8fafc'
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>

                <div className="risk-legend">
                  {riskDistribution.map((item, index) => (
                    <div
                      className="risk-legend-item"
                      key={item.name}
                    >
                      <span
                        className="legend-dot"
                        style={{ background: COLORS[index] }}
                      />

                      <span>{item.name}</span>

                      <strong>
                        {dataLoading ? 'â€”' : item.value}
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
            </article>
          </section>

          {canViewAml && (
            <section className="tables-grid">
              <article className="panel table-panel">
                <div className="panel-heading">
                  <div>
                    <h3>Recent AML Alerts</h3>
                    <p>Latest monitoring alerts</p>
                  </div>

                  <span className="table-count">
                    {amlData.length} records
                  </span>
                </div>

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Customer</th>
                        <th>Indicator</th>
                        <th>Severity</th>
                        <th>Date</th>
                      </tr>
                    </thead>

                    <tbody>
                      {dataLoading ? (
                        <tr>
                          <td colSpan="4" className="empty-cell">
                            Loading...
                          </td>
                        </tr>
                      ) : recentAlerts.length === 0 ? (
                        <tr>
                          <td colSpan="4" className="empty-cell">
                            No AML alerts found
                          </td>
                        </tr>
                      ) : (
                        recentAlerts.map((alert, index) => (
                          <tr key={alert.alert_id || index}>
                            <td>
                              <strong>
                                {alert.customer_name || 'Unknown'}
                              </strong>
                              <small>
                                {alert.alert_status || '-'}
                              </small>
                            </td>

                            <td>
                              {alert.indicator_name ||
                                alert.indicator_code ||
                                '-'}
                            </td>

                            <td>
                              <span
                                className={`severity ${String(
                                  alert.severity || ''
                                ).toLowerCase()}`}
                              >
                                {alert.severity || 'Unknown'}
                              </span>
                            </td>

                            <td>{formatDate(alert.created_at)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </article>

              <article className="panel table-panel">
                <div className="panel-heading">
                  <div>
                    <h3>Recent Transactions</h3>
                    <p>Latest transaction records</p>
                  </div>

                  <span className="table-count">
                    {transactionData.length} records
                  </span>
                </div>

                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Reference</th>
                        <th>Asset</th>
                        <th>Amount</th>
                        <th>Status</th>
                      </tr>
                    </thead>

                    <tbody>
                      {dataLoading ? (
                        <tr>
                          <td colSpan="4" className="empty-cell">
                            Loading...
                          </td>
                        </tr>
                      ) : recentTransactions.length === 0 ? (
                        <tr>
                          <td colSpan="4" className="empty-cell">
                            No transactions found
                          </td>
                        </tr>
                      ) : (
                        recentTransactions.map((tx, index) => (
                          <tr key={tx.transaction_id || index}>
                            <td>
                              <strong>
                                {tx.reference_code || '-'}
                              </strong>
                              <small>
                                {formatDateTime(tx.initiated_at)}
                              </small>
                            </td>

                            <td>{tx.symbol || '-'}</td>

                            <td>
                              {formatNumber(
                                Number(tx.amount).toFixed(4)
                              )}
                            </td>

                            <td>
                              <span
                                className={`transaction-status ${String(
                                  tx.transaction_status || ''
                                ).toLowerCase()}`}
                              >
                                {tx.transaction_status || 'Unknown'}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </article>
            </section>
          )}

          {!canViewAml && (
            <article className="panel table-panel">
              <div className="panel-heading">
                <div>
                  <h3>Recent Transactions</h3>
                  <p>Latest transaction records</p>
                </div>

                <span className="table-count">
                  {transactionData.length} records
                </span>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Reference</th>
                      <th>Asset</th>
                      <th>Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>

                  <tbody>
                    {dataLoading ? (
                      <tr>
                        <td colSpan="4" className="empty-cell">
                          Loading...
                        </td>
                      </tr>
                    ) : recentTransactions.length === 0 ? (
                      <tr>
                        <td colSpan="4" className="empty-cell">
                          No transactions found
                        </td>
                      </tr>
                    ) : (
                      recentTransactions.map((tx, index) => (
                        <tr key={tx.transaction_id || index}>
                          <td>
                            <strong>
                              {tx.reference_code || '-'}
                            </strong>
                            <small>
                              {formatDateTime(tx.initiated_at)}
                            </small>
                          </td>

                          <td>{tx.symbol || '-'}</td>

                          <td>
                            {formatNumber(
                              Number(tx.amount).toFixed(4)
                            )}
                          </td>

                          <td>
                            <span
                              className={`transaction-status ${String(
                                tx.transaction_status || ''
                              ).toLowerCase()}`}
                            >
                              {tx.transaction_status || 'Unknown'}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </article>
          )}

          <footer className="dashboard-footer">
            <span>
              CRYPTEX Â· Digital Asset KYC, AML & Blockchain Monitoring
            </span>
            <span>Educational Database Project Â· AIE313</span>
          </footer>
        </section>
      </main>

      <Chatbot />
    </div>
  )
}

export default Dashboard


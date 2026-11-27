import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { ArrowLeft, RefreshCw, ShieldAlert, CircleAlert } from 'lucide-react'

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function AMLMonitoring() {
  const { profile } = useAuth()
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadAlerts() {
    setLoading(true)
    setError('')

    const { data, error: queryError } = await supabase
      .from('v_aml_investigation_dashboard')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)

    if (queryError) {
      setError(queryError.message)
      setAlerts([])
    } else {
      setAlerts(data || [])
    }

    setLoading(false)
  }

  useEffect(() => {
    loadAlerts()
  }, [])

  return (
    <main className="aml-page">
      <header className="aml-page-header">
        <div>
          <Link className="aml-back-link" to="/dashboard">
            <ArrowLeft size={16} /> Back to Dashboard
          </Link>
          <div className="aml-title-row">
            <div className="aml-title-icon"><ShieldAlert size={23} /></div>
            <div>
              <h1>AML Monitoring</h1>
              <p>Alert monitoring and investigation overview</p>
            </div>
          </div>
        </div>
        <div className="aml-user-label">
          {profile?.full_name || profile?.email} · {profile?.role}
        </div>
      </header>

      {error && (
        <div className="aml-error">
          <CircleAlert size={18} />
          <div>
            <strong>Unable to load AML alerts</strong>
            <p>{error}</p>
          </div>
        </div>
      )}

      <section className="aml-panel">
        <div className="aml-panel-heading">
          <div>
            <h2>AML Alerts</h2>
            <p>{loading ? 'Loading records...' : `${alerts.length} records displayed (maximum 200)`}</p>
          </div>
          <button className="aml-refresh-button" onClick={loadAlerts} disabled={loading}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>

        <div className="aml-table-wrap">
          <table className="aml-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Indicator</th>
                <th>Severity</th>
                <th>Transaction</th>
                <th>Amount</th>
                <th>Alert Status</th>
                <th>Created At</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" className="aml-empty">Loading AML data...</td></tr>
              ) : alerts.length === 0 ? (
                <tr><td colSpan="7" className="aml-empty">No AML alerts found.</td></tr>
              ) : alerts.map((alert, index) => (
                <tr key={alert.alert_id || index}>
                  <td>{alert.customer_name || '-'}</td>
                  <td>{alert.indicator_name || alert.indicator_code || '-'}</td>
                  <td>
                    <span className={`aml-severity ${String(alert.severity || '').toLowerCase()}`}>
                      {alert.severity || 'UNKNOWN'}
                    </span>
                  </td>
                  <td>{alert.transaction_type || '-'}</td>
                  <td>
                    {alert.transaction_amount == null
                      ? '-'
                      : `${Number(alert.transaction_amount).toLocaleString('en-US')} ${alert.transaction_asset || ''}`}
                  </td>
                  <td>{alert.alert_status || '-'}</td>
                  <td>{formatDate(alert.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}

export default AMLMonitoring

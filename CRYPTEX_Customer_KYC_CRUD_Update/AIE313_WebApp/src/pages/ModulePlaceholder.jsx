
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import {
  Users,
  Wallet,
  ArrowLeftRight,
  Blocks,
  RefreshCw,
  Database,
  AlertCircle
} from 'lucide-react'

import { supabase } from '../lib/supabase'

const MODULES = {
  '/customer-kyc': {
    title: 'Customer KYC',
    description: 'Customer identity verification and KYC document management.',
    icon: Users,
    view: 'v_customer_kyc_status'
  },

  '/accounts-assets': {
    title: 'Accounts & Assets',
    description: 'Digital asset accounts, wallets, networks and balances.',
    icon: Wallet,
    view: 'v_account_asset_balance_summary'
  },

  '/transactions': {
    title: 'Transactions',
    description: 'Deposit, withdrawal, transfer and trading transaction management.',
    icon: ArrowLeftRight,
    view: 'v_transaction_history'
  },

  '/blockchain-risk': {
    title: 'Blockchain Risk',
    description: 'Blockchain address risk scores and suspicious transfer monitoring.',
    icon: Blocks,
    view: 'v_blockchain_address_risk'
  }
}

function formatColumnName(value) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
}

function formatCellValue(value) {
  if (value === null || value === undefined || value === '') {
    return '-'
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No'
  }

  if (typeof value === 'object') {
    return JSON.stringify(value)
  }

  return String(value)
}

export default function ModulePlaceholder() {
  const location = useLocation()

  const module = MODULES[location.pathname]

  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadData = useCallback(async (isActive = () => true) => {
    if (!module) {
      setData([])
      setError('Module configuration not found.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')

    try {
      const { data: records, error: queryError } = await supabase
        .from(module.view)
        .select('*')
        .limit(100)

      if (!isActive()) return

      if (queryError) {
        setData([])
        setError(queryError.message)
      } else {
        setData(records || [])
      }
    } catch (err) {
      if (!isActive()) return

      setData([])
      setError(err.message || 'Unable to load module data.')
    } finally {
      if (isActive()) {
        setLoading(false)
      }
    }
  }, [module])

  useEffect(() => {
    let active = true

    loadData(() => active)

    return () => {
      active = false
    }
  }, [loadData])

  const columns = useMemo(() => {
    const keys = new Set()

    data.forEach(row => {
      Object.keys(row).forEach(key => keys.add(key))
    })

    return Array.from(keys)
  }, [data])

  if (!module) {
    return <p>Module not found.</p>
  }

  const Icon = module.icon

  return (
    <main className="module-data-page">

      {/* Module heading */}
      <div className="section-heading">
        <div>
          <div className="panel-heading">
            <div>
              <h2>{module.title}</h2>
              <p>{module.description}</p>
            </div>
          </div>
        </div>

        <button
          className="icon-button"
          onClick={() => loadData()}
          disabled={loading}
          title="Refresh data"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      {/* Data source information */}
      <div className="panel table-panel">
        <div className="panel-heading">
          <div>
            <h3>
              <Icon
                size={17}
                style={{
                  verticalAlign: 'middle',
                  marginRight: 8
                }}
              />
              {module.title} Records
            </h3>

            <p>
              <Database
                size={13}
                style={{
                  verticalAlign: 'middle',
                  marginRight: 5
                }}
              />
              Data source: {module.view}
            </p>
          </div>

          <span className="table-count">
            {loading ? 'Loading...' : `${data.length} records`}
          </span>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="chart-message">
            Loading data from Supabase...
          </div>
        )}

        {/* Error state */}
        {!loading && error && (
          <div className="error-banner">
            <AlertCircle size={20} />

            <div>
              <strong>Unable to load data</strong>
              <p>{error}</p>
            </div>

            <button onClick={() => loadData()}>
              Retry
            </button>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && data.length === 0 && (
          <div className="chart-message">
            No records found in this database view.
          </div>
        )}

        {/* Data table */}
        {!loading && !error && data.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {columns.map(column => (
                    <th key={column}>
                      {formatColumnName(column)}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {data.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {columns.map(column => (
                      <td key={column}>
                        {formatCellValue(row[column])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="module-note">
        Data is retrieved directly from the project's Supabase database.
        Maximum 100 records are displayed in this view.
      </p>

    </main>
  )
}

import { useCallback, useEffect, useState } from 'react'
import {
  AlertCircle,
  Check,
  Edit2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserRound,
  X
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const DATA_VIEW = 'v_customer_kyc_status'
const PROFILE_TABLE = 'customer_profiles'
const USER_TABLE = 'users'

function prettyDate(value) {
  if (!value) return '-'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '-'
    : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function statusClass(value) {
  const status = String(value || '').toLowerCase().replace(/[^a-z0-9_-]/g, '')
  return `customer-kyc-status ${status || 'unknown'}`
}

export default function CustomerKYC() {
  const { role } = useAuth()
  const isAdmin = role === 'ADMIN'

  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')

  const [dialog, setDialog] = useState(null)
  const [availableUsers, setAvailableUsers] = useState([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [form, setForm] = useState({ userId: '', nationality: '', customerStatus: 'ACTIVE' })

  const loadRecords = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true)
    else setLoading(true)
    setError('')

    const { data, error: queryError } = await supabase
      .from(DATA_VIEW)
      .select('*')
      .order('full_name', { ascending: true })
      .limit(100)

    if (queryError) {
      setRecords([])
      setError(queryError.message)
    } else {
      setRecords(data || [])
    }

    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => {
    loadRecords()
  }, [loadRecords])

  const filteredRecords = records.filter(record => {
    const term = search.trim().toLowerCase()
    if (!term) return true
    return [record.full_name, record.email, record.nationality, record.customer_status,
      record.verification_status, record.customer_id]
      .some(value => String(value || '').toLowerCase().includes(term))
  })

  async function openAddDialog() {
    setDialog({ mode: 'add' })
    setForm({ userId: '', nationality: '', customerStatus: 'ACTIVE' })
    setFormError('')
    setNotice('')
    setAvailableUsers([])
    setUsersLoading(true)

    const [{ data: users, error: usersError }, { data: profiles, error: profilesError }] = await Promise.all([
      supabase
        .from(USER_TABLE)
        .select('user_id, full_name, email, role, account_status')
        .eq('role', 'CUSTOMER')
        .eq('account_status', 'ACTIVE')
        .order('full_name', { ascending: true }),
      supabase
        .from(PROFILE_TABLE)
        .select('user_id')
    ])

    setUsersLoading(false)

    if (usersError || profilesError) {
      setFormError(usersError?.message || profilesError?.message || 'Unable to load customer accounts.')
      return
    }

    const existingUserIds = new Set((profiles || []).map(row => row.user_id))
    setAvailableUsers((users || []).filter(user => !existingUserIds.has(user.user_id)))
  }

  function openEditDialog(record) {
    setDialog({ mode: 'edit', record })
    setForm({
      userId: record.user_id || '',
      nationality: record.nationality || '',
      customerStatus: String(record.customer_status || 'ACTIVE').toUpperCase()
    })
    setFormError('')
    setNotice('')
  }

  function closeDialog() {
    if (saving) return
    setDialog(null)
    setFormError('')
  }

  async function handleSave(event) {
    event.preventDefault()
    if (!isAdmin || !dialog) return
    setSaving(true)
    setFormError('')
    setNotice('')

    const nationality = form.nationality.trim()
    if (!nationality) {
      setFormError('Please enter the customer nationality.')
      setSaving(false)
      return
    }

    let result
    if (dialog.mode === 'add') {
      if (!form.userId) {
        setFormError('Please select a registered customer account.')
        setSaving(false)
        return
      }
      // A Customer Profile is created for an existing, active CUSTOMER user.
      // Authentication accounts are provisioned through the existing registration flow.
      result = await supabase.from(PROFILE_TABLE).insert({
        customer_id: crypto.randomUUID(),
        user_id: form.userId,
        nationality,
        customer_status: form.customerStatus
      })
    } else {
      result = await supabase.from(PROFILE_TABLE)
        .update({ nationality, customer_status: form.customerStatus })
        .eq('customer_id', dialog.record.customer_id)
    }

    if (result.error) {
      setFormError(result.error.message)
      setSaving(false)
      return
    }

    setDialog(null)
    setNotice(dialog.mode === 'add' ? 'Customer profile created successfully.' : 'Customer profile updated successfully.')
    await loadRecords(true)
    setSaving(false)
  }

  async function handleDelete(record) {
    if (!isAdmin) return
    const confirmed = window.confirm(
      `Delete the customer profile for ${record.full_name || 'this customer'}? This does not delete the login account. If KYC or risk records reference this profile, the database may block deletion.`
    )
    if (!confirmed) return

    setError('')
    setNotice('')
    const { error: deleteError } = await supabase
      .from(PROFILE_TABLE)
      .delete()
      .eq('customer_id', record.customer_id)

    if (deleteError) {
      setError(`Unable to delete this customer profile: ${deleteError.message}`)
      return
    }

    setNotice('Customer profile deleted. The customer login account remains unchanged.')
    await loadRecords(true)
  }

  return (
    <main className="module-data-page customer-kyc-page">
      <div className="section-heading customer-kyc-heading">
        <div>
          <div className="panel-heading">
            <div>
              <h2>Customer KYC</h2>
              <p>Customer identity verification and KYC document management.</p>
            </div>
          </div>
        </div>
        <div className="customer-kyc-toolbar">
          <label className="customer-kyc-search">
            <Search size={16} />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search customers..."
              aria-label="Search customers"
            />
          </label>
          {isAdmin && (
            <button className="customer-kyc-primary" onClick={openAddDialog}>
              <Plus size={16} /> Add Customer
            </button>
          )}
          <button
            className="icon-button"
            onClick={() => loadRecords(true)}
            disabled={loading || refreshing}
            title="Refresh data"
            aria-label="Refresh data"
          >
            <RefreshCw size={17} className={refreshing ? 'customer-kyc-spinning' : ''} />
          </button>
        </div>
      </div>

      {notice && <div className="customer-kyc-notice"><Check size={16} />{notice}</div>}
      {error && (
        <div className="error-banner customer-kyc-error">
          <AlertCircle size={18} />
          <div><strong>Customer KYC operation failed</strong><p>{error}</p></div>
        </div>
      )}

      <section className="panel table-panel customer-kyc-panel">
        <div className="panel-heading">
          <div>
            <h3><UserRound size={17} style={{ verticalAlign: 'middle', marginRight: 8 }} />Customer KYC Records</h3>
            <p>Data source: {DATA_VIEW}</p>
          </div>
          <span className="table-count">{loading ? 'Loading...' : `${filteredRecords.length} of ${records.length} records`}</span>
        </div>

        {loading ? (
          <div className="chart-message">Loading customer records from Supabase...</div>
        ) : filteredRecords.length === 0 ? (
          <div className="chart-message">{records.length ? 'No customers match your search.' : 'No customer records found.'}</div>
        ) : (
          <div className="table-wrap">
            <table className="customer-kyc-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Email</th>
                  <th>Nationality</th>
                  <th>Customer Status</th>
                  <th>KYC Status</th>
                  <th>Submission</th>
                  <th>Submitted At</th>
                  <th>Reviewer</th>
                  {isAdmin && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((record, index) => (
                  <tr key={record.customer_id || index}>
                    <td>
                      <strong className="customer-kyc-name">{record.full_name || 'Unnamed customer'}</strong>
                      <small className="customer-kyc-id">{record.customer_id || '-'}</small>
                    </td>
                    <td>{record.email || '-'}</td>
                    <td>{record.nationality || '-'}</td>
                    <td><span className={statusClass(record.customer_status)}>{record.customer_status || 'UNKNOWN'}</span></td>
                    <td><span className={statusClass(record.verification_status)}>{record.verification_status || 'NOT SUBMITTED'}</span></td>
                    <td>{record.submission_no ?? '-'}</td>
                    <td>{prettyDate(record.submitted_at)}</td>
                    <td>{record.reviewer_name || '-'}</td>
                    {isAdmin && (
                      <td>
                        <div className="customer-kyc-actions">
                          <button className="customer-kyc-icon-action edit" title="Edit customer" aria-label={`Edit ${record.full_name || 'customer'}`} onClick={() => openEditDialog(record)}>
                            <Edit2 size={14} />
                          </button>
                          <button className="customer-kyc-icon-action delete" title="Delete customer profile" aria-label={`Delete ${record.full_name || 'customer'} profile`} onClick={() => handleDelete(record)}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="module-note">Data is read from {DATA_VIEW}. Customer profile changes are written to {PROFILE_TABLE}. Maximum 100 records are displayed.</p>

      {dialog && (
        <div className="customer-kyc-modal-backdrop" role="presentation" onMouseDown={event => {
          if (event.target === event.currentTarget) closeDialog()
        }}>
          <section className="customer-kyc-modal" role="dialog" aria-modal="true" aria-labelledby="customer-kyc-modal-title">
            <header className="customer-kyc-modal-header">
              <div>
                <span className="customer-kyc-modal-eyebrow">ADMIN · CUSTOMER MANAGEMENT</span>
                <h2 id="customer-kyc-modal-title">{dialog.mode === 'add' ? 'Add Customer' : 'Edit Customer'}</h2>
                <p>{dialog.mode === 'add' ? 'Create a KYC profile for an existing registered customer account.' : 'Update the customer profile details.'}</p>
              </div>
              <button className="customer-kyc-close" onClick={closeDialog} aria-label="Close dialog" disabled={saving}><X size={18} /></button>
            </header>

            <form className="customer-kyc-form" onSubmit={handleSave}>
              {dialog.mode === 'add' && (
                <label>
                  Registered Customer Account <span>*</span>
                  <select value={form.userId} onChange={event => setForm(current => ({ ...current, userId: event.target.value }))} required disabled={usersLoading || saving}>
                    <option value="">{usersLoading ? 'Loading customer accounts...' : 'Select a customer account'}</option>
                    {availableUsers.map(user => (
                      <option key={user.user_id} value={user.user_id}>{user.full_name || 'Unnamed'} · {user.email}</option>
                    ))}
                  </select>
                  {!usersLoading && availableUsers.length === 0 && <small>There are no active CUSTOMER accounts without a profile. The customer must register first.</small>}
                </label>
              )}

              {dialog.mode === 'edit' && (
                <div className="customer-kyc-readonly-field">
                  <span>Customer</span>
                  <strong>{dialog.record.full_name || '-'}</strong>
                  <small>{dialog.record.email || '-'}</small>
                </div>
              )}

              <label>
                Nationality <span>*</span>
                <input
                  value={form.nationality}
                  onChange={event => setForm(current => ({ ...current, nationality: event.target.value }))}
                  placeholder="e.g. Thai"
                  maxLength={80}
                  required
                  disabled={saving}
                />
              </label>

              <label>
                Customer Status
                <select value={form.customerStatus} onChange={event => setForm(current => ({ ...current, customerStatus: event.target.value }))} disabled={saving}>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="SUSPENDED">SUSPENDED</option>
                </select>
              </label>

              {formError && <div className="customer-kyc-form-error"><AlertCircle size={16} />{formError}</div>}

              <footer className="customer-kyc-modal-actions">
                <button type="button" className="customer-kyc-secondary" onClick={closeDialog} disabled={saving}>Cancel</button>
                <button type="submit" className="customer-kyc-primary" disabled={saving || (dialog.mode === 'add' && (!availableUsers.length || usersLoading))}>
                  {saving ? 'Saving...' : <><Check size={16} />{dialog.mode === 'add' ? 'Create Customer' : 'Save Changes'}</>}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </main>
  )
}

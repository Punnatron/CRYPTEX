import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Edit3,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Users,
  X
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const EMPTY_FORM = {
  user_id: '',
  date_of_birth: '',
  nationality: '',
  occupation: '',
  monthly_income: ''
}

const STATUS_LABELS = {
  PENDING: 'PENDING',
  VERIFIED: 'VERIFIED',
  SUSPENDED: 'SUSPENDED',
  CLOSED: 'CLOSED'
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString()
}

function localDateInputValue() {
  const date = new Date()
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 10)
}

function formatIncome(value) {
  if (value === null || value === undefined || value === '') return '—'
  return Number(value).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })
}

function StatusBadge({ status }) {
  const normalized = String(status || 'PENDING').toUpperCase()
  return <span className={`cm-status cm-status-${normalized.toLowerCase()}`}>{STATUS_LABELS[normalized] || normalized}</span>
}

export default function CustomerManagement() {
  const { role } = useAuth()
  const [profiles, setProfiles] = useState([])
  const [unlinkedUsers, setUnlinkedUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [profilesResult, usersResult] = await Promise.all([
        supabase.rpc('cryptex_admin_list_customer_profiles'),
        supabase.rpc('cryptex_admin_list_unlinked_customer_users')
      ])

      if (profilesResult.error) throw profilesResult.error
      if (usersResult.error) throw usersResult.error

      setProfiles(profilesResult.data || [])
      setUnlinkedUsers(usersResult.data || [])
    } catch (err) {
      setError(err.message || 'Unable to load customer management data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (String(role || '').toUpperCase() === 'ADMIN') loadData()
  }, [role, loadData])

  const filteredProfiles = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return profiles
    return profiles.filter(item => [
      item.full_name,
      item.email,
      item.nationality,
      item.customer_status
    ].some(value => String(value || '').toLowerCase().includes(term)))
  }, [profiles, search])

  const verifiedCount = profiles.filter(item => item.customer_status === 'VERIFIED').length
  const pendingCount = profiles.filter(item => item.customer_status === 'PENDING').length

  function openCreate() {
    setEditing(null)
    setForm({ ...EMPTY_FORM, user_id: unlinkedUsers[0]?.user_id || '' })
    setError('')
    setNotice('')
    setModalOpen(true)
  }

  function openEdit(item) {
    setEditing(item)
    setForm({
      ...EMPTY_FORM,
      date_of_birth: item.date_of_birth || '',
      nationality: item.nationality || '',
      occupation: item.occupation || '',
      monthly_income: item.monthly_income ?? ''
    })
    setError('')
    setNotice('')
    setModalOpen(true)
  }

  function closeModal() {
    if (saving) return
    setModalOpen(false)
    setEditing(null)
    setForm(EMPTY_FORM)
  }

  function updateField(name, value) {
    setForm(current => ({ ...current, [name]: value }))
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')

    try {
      const monthlyIncome = form.monthly_income === '' ? null : Number(form.monthly_income)
      if (monthlyIncome !== null && (!Number.isFinite(monthlyIncome) || monthlyIncome < 0)) {
        throw new Error('Monthly income must be zero or greater.')
      }

      if (editing) {
        const { error: updateError } = await supabase.rpc('cryptex_admin_update_customer_profile', {
          p_customer_id: editing.customer_id,
          p_date_of_birth: form.date_of_birth,
          p_nationality: form.nationality.trim(),
          p_occupation: form.occupation.trim() || null,
          p_monthly_income: monthlyIncome
        })
        if (updateError) throw updateError
        setNotice('Customer profile updated successfully.')
      } else {
        if (!form.user_id) throw new Error('Select a registered customer account first.')
        const { error: createError } = await supabase.rpc('cryptex_admin_create_customer_profile', {
          p_user_id: form.user_id,
          p_date_of_birth: form.date_of_birth,
          p_nationality: form.nationality.trim(),
          p_occupation: form.occupation.trim() || null,
          p_monthly_income: monthlyIncome
        })
        if (createError) throw createError
        setNotice('Customer profile created successfully.')
      }

      setModalOpen(false)
      setEditing(null)
      setForm(EMPTY_FORM)
      await loadData()
    } catch (err) {
      setError(err.message || 'Unable to save customer profile.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(item) {
    const confirmed = window.confirm(
      `Delete the profile for ${item.full_name || item.email}? This action is available only when the profile has no KYC, risk, AML or exchange history. The login account will not be deleted.`
    )
    if (!confirmed) return

    setSaving(true)
    setError('')
    setNotice('')
    try {
      const { error: deleteError } = await supabase.rpc('cryptex_admin_delete_customer_profile', {
        p_customer_id: item.customer_id
      })
      if (deleteError) throw deleteError
      setNotice('Customer profile deleted. The login account was kept.')
      await loadData()
    } catch (err) {
      setError(err.message || 'Unable to delete customer profile.')
    } finally {
      setSaving(false)
    }
  }

  if (String(role || '').toUpperCase() !== 'ADMIN') {
    return <div className="cm-page"><div className="cm-error"><AlertCircle size={18} /> This page is available to ADMIN only.</div></div>
  }

  return (
    <main className="cm-page">
      <div className="cm-heading-row">
        <div>
          <div className="cm-eyebrow">ADMINISTRATION / CUSTOMER DATA</div>
          <h2>Customer Management</h2>
          <p>Manage customer profiles in the CRYPTEX database.</p>
        </div>
        <div className="cm-heading-actions">
          <button className="cm-button cm-button-secondary" onClick={loadData} disabled={loading || saving}>
            <RefreshCw size={16} className={loading ? 'cm-spin' : ''} /> Refresh
          </button>
          <button className="cm-button cm-button-primary" onClick={openCreate} disabled={unlinkedUsers.length === 0 || loading || saving}>
            <Plus size={17} /> Add Customer
          </button>
        </div>
      </div>

      {error && <div className="cm-alert cm-alert-error"><AlertCircle size={17} /><span>{error}</span></div>}
      {notice && <div className="cm-alert cm-alert-success"><CheckCircle2 size={17} /><span>{notice}</span></div>}

      <div className="cm-stats-grid">
        <section className="cm-stat-card">
          <span className="cm-stat-icon"><Users size={18} /></span>
          <div><span className="cm-stat-label">Customer Profiles</span><strong>{profiles.length}</strong></div>
        </section>
        <section className="cm-stat-card">
          <span className="cm-stat-icon cm-stat-icon-green"><ShieldCheck size={18} /></span>
          <div><span className="cm-stat-label">Verified Profiles</span><strong>{verifiedCount}</strong></div>
        </section>
        <section className="cm-stat-card">
          <span className="cm-stat-icon cm-stat-icon-amber"><AlertCircle size={18} /></span>
          <div><span className="cm-stat-label">Pending Profiles</span><strong>{pendingCount}</strong></div>
        </section>
        <section className="cm-stat-card">
          <span className="cm-stat-icon"><Plus size={18} /></span>
          <div><span className="cm-stat-label">Accounts Without Profile</span><strong>{unlinkedUsers.length}</strong></div>
        </section>
      </div>

      <section className="cm-panel">
        <div className="cm-panel-header">
          <div>
            <h3>Customer Profiles</h3>
            <p>Source: public.customer_profiles joined with public.users</p>
          </div>
          <label className="cm-search">
            <Search size={16} />
            <input
              type="search"
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search name, email, nationality..."
            />
          </label>
        </div>

        <div className="cm-table-wrap">
          <table className="cm-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Date of Birth</th>
                <th>Nationality</th>
                <th>Occupation</th>
                <th>Monthly Income</th>
                <th>Profile Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" className="cm-empty">Loading customer profiles...</td></tr>
              ) : filteredProfiles.length === 0 ? (
                <tr><td colSpan="7" className="cm-empty">No customer profiles found.</td></tr>
              ) : filteredProfiles.map(item => (
                <tr key={item.customer_id}>
                  <td>
                    <div className="cm-customer-name">{item.full_name || 'Customer'}</div>
                    <div className="cm-customer-email">{item.email}</div>
                  </td>
                  <td>{formatDate(item.date_of_birth)}</td>
                  <td>{item.nationality || '—'}</td>
                  <td>{item.occupation || '—'}</td>
                  <td>{formatIncome(item.monthly_income)}</td>
                  <td><StatusBadge status={item.customer_status} /></td>
                  <td>
                    <div className="cm-row-actions">
                      <button className="cm-icon-button" title="Edit profile" onClick={() => openEdit(item)} disabled={saving}>
                        <Edit3 size={15} />
                      </button>
                      <button
                        className="cm-icon-button cm-icon-danger"
                        title={item.has_related_records ? 'Cannot delete: profile has related history' : 'Delete profile'}
                        onClick={() => handleDelete(item)}
                        disabled={saving || item.has_related_records}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="cm-table-footer">
          <span>{filteredProfiles.length} of {profiles.length} profiles</span>
          <span>Delete is disabled when KYC, risk, AML or exchange history exists.</span>
        </div>
      </section>

      {unlinkedUsers.length === 0 && (
        <div className="cm-info-note">
          <ShieldCheck size={17} />
          All active registered CUSTOMER accounts already have a profile. To demonstrate Create, register a new CUSTOMER account first, then return here as ADMIN.
        </div>
      )}

      {modalOpen && (
        <div className="cm-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) closeModal() }}>
          <section className="cm-modal" role="dialog" aria-modal="true" aria-labelledby="cm-modal-title">
            <header className="cm-modal-header">
              <div>
                <span className="cm-eyebrow">CUSTOMER PROFILE</span>
                <h3 id="cm-modal-title">{editing ? 'Edit Customer Profile' : 'Add Customer Profile'}</h3>
              </div>
              <button type="button" className="cm-icon-button" onClick={closeModal} disabled={saving} aria-label="Close"><X size={18} /></button>
            </header>

            {error && <div className="cm-alert cm-alert-error" style={{ margin: '14px 22px 0' }}><AlertCircle size={17} /><span>{error}</span></div>}

            <form onSubmit={handleSubmit} className="cm-form">
              {!editing && (
                <label className="cm-field cm-field-full">
                  Registered Customer Account
                  <select required value={form.user_id} onChange={event => updateField('user_id', event.target.value)}>
                    <option value="">Select customer account</option>
                    {unlinkedUsers.map(item => <option key={item.user_id} value={item.user_id}>{item.full_name} — {item.email}</option>)}
                  </select>
                </label>
              )}

              {editing && (
                <div className="cm-readonly-user cm-field-full">
                  <span>Customer Account</span>
                  <strong>{editing.full_name}</strong>
                  <small>{editing.email}</small>
                </div>
              )}

              <label className="cm-field">
                Date of Birth
                <input type="date" required max={localDateInputValue()} value={form.date_of_birth} onChange={event => updateField('date_of_birth', event.target.value)} />
              </label>
              <label className="cm-field">
                Nationality
                <input type="text" required maxLength={80} placeholder="e.g. Thailand" value={form.nationality} onChange={event => updateField('nationality', event.target.value)} />
              </label>
              <label className="cm-field">
                Occupation
                <input type="text" maxLength={100} placeholder="Optional" value={form.occupation} onChange={event => updateField('occupation', event.target.value)} />
              </label>
              <label className="cm-field">
                Monthly Income (THB)
                <input type="number" min="0" step="0.01" placeholder="Optional" value={form.monthly_income} onChange={event => updateField('monthly_income', event.target.value)} />
              </label>

              <div className="cm-form-note cm-field-full">
                <ShieldCheck size={16} />
                Customer status is managed by the KYC workflow. Creating a profile starts it as PENDING; approving KYC updates it to VERIFIED.
              </div>
              <div className="cm-modal-actions cm-field-full">
                <button type="button" className="cm-button cm-button-secondary" onClick={closeModal} disabled={saving}>Cancel</button>
                <button type="submit" className="cm-button cm-button-primary" disabled={saving}>
                  {saving ? <RefreshCw size={16} className="cm-spin" /> : <CheckCircle2 size={16} />}
                  {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Customer'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  )
}

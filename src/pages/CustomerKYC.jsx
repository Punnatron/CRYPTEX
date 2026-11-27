import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  FileCheck2,
  Eye,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  UploadCloud,
  X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const BUCKET = 'kyc-documents'
const MAX_FILE_SIZE = 8 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf']

const panel = {
  background: '#111d2f',
  border: '1px solid #263850',
  borderRadius: 12,
  padding: 22,
  marginBottom: 18,
}
const field = {
  display: 'grid',
  gap: 7,
  color: '#a9bad0',
  fontSize: 12,
  fontWeight: 600,
}
const input = {
  width: '100%',
  minWidth: 0,
  padding: '11px 12px',
  color: '#e6edf7',
  background: '#0b1525',
  border: '1px solid #344761',
  borderRadius: 8,
  outline: 'none',
}
const primary = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  border: 0,
  borderRadius: 8,
  padding: '11px 16px',
  color: '#fff',
  background: '#2563eb',
  fontWeight: 700,
  cursor: 'pointer',
}
const secondary = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  border: '1px solid #344761',
  borderRadius: 8,
  padding: '10px 14px',
  color: '#cbd5e1',
  background: '#17263b',
  fontWeight: 600,
  cursor: 'pointer',
}

const formatDate = (value) => {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

function StatusBadge({ status, note }) {
  const requestedInfo = status === 'PENDING' && Boolean(note)
  const label = requestedInfo ? 'MORE INFO REQUESTED' : (status || 'NOT SUBMITTED').replaceAll('_', ' ')
  const colors = status === 'APPROVED'
    ? { color: '#86efac', background: '#123323' }
    : status === 'REJECTED'
      ? { color: '#fca5a5', background: '#3a1b25' }
      : status === 'PENDING'
        ? { color: '#fcd34d', background: '#3b2d12' }
        : { color: '#93c5fd', background: '#142b46' }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '5px 9px',
        borderRadius: 6,
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: '.04em',
        color: colors.color,
        background: colors.background,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  )
}

function Alert({ type = 'error', children }) {
  const success = type === 'success'
  return (
    <div
      role="status"
      style={{
        ...panel,
        marginBottom: 16,
        padding: '13px 16px',
        color: success ? '#86efac' : '#fecaca',
        borderColor: success ? '#276044' : '#7f303b',
        background: success ? 'rgba(18,51,35,.65)' : 'rgba(58,27,37,.65)',
        fontSize: 12,
        lineHeight: 1.6,
      }}
    >
      {children}
    </div>
  )
}

export default function CustomerKYC() {
  const { user, profile, role } = useAuth()
  const normalizedRole = String(role || '').trim().toUpperCase()
  const isCustomer = normalizedRole === 'CUSTOMER'
  const isOfficer = normalizedRole === 'KYC_OFFICER'
  const profileUserId = profile?.user_id
  const fileInputRef = useRef(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [myRecord, setMyRecord] = useState(null)
  const [queue, setQueue] = useState([])
  const [selected, setSelected] = useState(null)
  const [reviewNote, setReviewNote] = useState('')
  const [documentUrl, setDocumentUrl] = useState('')
  const [form, setForm] = useState({
    date_of_birth: '',
    nationality: '',
    occupation: '',
    monthly_income: '',
    document_type: 'PASSPORT',
    masked_document_number: '',
    expiry_date: '',
  })
  const [file, setFile] = useState(null)

  const today = useMemo(() => {
    const now = new Date()
    const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
    return localDate.toISOString().slice(0, 10)
  }, [])

  const load = useCallback(async ({ clearNotice = true } = {}) => {
    setLoading(true)
    setError('')
    if (clearNotice) setNotice('')

    try {
      if (isCustomer) {
        const { data: customer, error: customerError } = await supabase
          .from('customer_profiles')
          .select('customer_id, date_of_birth, nationality, occupation, monthly_income, customer_status')
          .eq('user_id', profileUserId)
          .maybeSingle()

        if (customerError) throw customerError
        if (!customer) {
          setMyRecord(null)
          return
        }

        const { data: verification, error: verificationError } = await supabase
          .from('kyc_verifications')
          .select('kyc_id, submission_no, verification_level, verification_status, submitted_at, reviewed_at, rejection_reason')
          .eq('customer_id', customer.customer_id)
          .maybeSingle()

        if (verificationError) throw verificationError

        let documents = []
        if (verification?.kyc_id) {
          const { data, error: documentsError } = await supabase
            .from('kyc_documents')
            .select('document_id, document_type, masked_document_number, file_reference, document_status, expiry_date, uploaded_at')
            .eq('kyc_id', verification.kyc_id)
            .order('uploaded_at', { ascending: false })

          if (documentsError) throw documentsError
          documents = data || []
        }

        setMyRecord({ ...customer, verification: verification || null, documents })
        setForm((current) => ({
          ...current,
          date_of_birth: customer.date_of_birth || current.date_of_birth,
          nationality: customer.nationality || current.nationality,
          occupation: customer.occupation || current.occupation,
          monthly_income: customer.monthly_income ?? current.monthly_income,
        }))
        return
      }

      let query = supabase
        .from('kyc_verifications')
        .select(`
          kyc_id,
          customer_id,
          submission_no,
          verification_level,
          verification_status,
          submitted_at,
          reviewed_at,
          rejection_reason,
          customer_profiles!inner (
            customer_id,
            user_id,
            date_of_birth,
            nationality,
            occupation,
            monthly_income,
            customer_status,
            users!inner (full_name, email)
          ),
          kyc_documents (
            document_id,
            document_type,
            masked_document_number,
            file_reference,
            document_status,
            expiry_date,
            uploaded_at
          )
        `)
        .order('submitted_at', { ascending: false })

      // Applications waiting for the customer to provide more information are
      // hidden from the officer's actionable queue until the customer resubmits.
      if (isOfficer) {
        query = query
          .eq('verification_status', 'PENDING')
          .is('rejection_reason', null)
      }

      const { data, error: queueError } = await query
      if (queueError) throw queueError
      setQueue(data || [])
    } catch (loadError) {
      setError(loadError.message || 'Unable to load KYC information.')
    } finally {
      setLoading(false)
    }
  }, [isCustomer, isOfficer, profileUserId])

  useEffect(() => {
    if (profileUserId) void load()
  }, [profileUserId, load])

  async function submitKyc(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    let uploadedPath = null

    try {
      if (!form.date_of_birth || form.date_of_birth >= today) {
        throw new Error('Please enter a valid date of birth in the past.')
      }
      if (!form.nationality.trim()) throw new Error('Nationality is required.')
      if (form.monthly_income !== '' && (!Number.isFinite(Number(form.monthly_income)) || Number(form.monthly_income) < 0)) {
        throw new Error('Monthly income must be zero or a positive number.')
      }
      if (!file) throw new Error('Please attach an identity document.')
      if (!ALLOWED_TYPES.includes(file.type)) throw new Error('Only JPG, PNG or PDF files are allowed.')
      if (file.size > MAX_FILE_SIZE) throw new Error('File size must not exceed 8 MB.')
      if (!user?.id) throw new Error('Your login session has expired. Please sign in again.')

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      uploadedPath = `${user.id}/${crypto.randomUUID()}-${safeName}`

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(uploadedPath, file, { upsert: false, contentType: file.type })
      if (uploadError) throw uploadError

      const { error: submitError } = await supabase.rpc('cryptex_submit_kyc', {
        p_date_of_birth: form.date_of_birth,
        p_nationality: form.nationality.trim(),
        p_occupation: form.occupation.trim() || null,
        p_monthly_income: form.monthly_income === '' ? null : Number(form.monthly_income),
        p_document_type: form.document_type,
        p_masked_document_number: form.masked_document_number.trim() || null,
        p_file_reference: uploadedPath,
        p_expiry_date: form.expiry_date || null,
      })
      if (submitError) throw submitError

      setFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      setNotice('Your KYC application has been submitted. Its current status is PENDING.')
      await load({ clearNotice: false })
    } catch (submitError) {
      // Avoid leaving an unreferenced identity document in private storage.
      if (uploadedPath) {
        await supabase.storage.from(BUCKET).remove([uploadedPath]).catch(() => {})
      }
      setError(submitError.message || 'KYC submission failed.')
    } finally {
      setSaving(false)
    }
  }

  async function review(decision) {
    if (!selected) return
    if (decision !== 'APPROVED' && !reviewNote.trim()) {
      setError('Please provide a reason or the additional information required.')
      return
    }

    setSaving(true)
    setError('')
    setNotice('')
    try {
      const { error: reviewError } = await supabase.rpc('cryptex_review_kyc', {
        p_kyc_id: selected.kyc_id,
        p_decision: decision,
        p_reason: reviewNote.trim() || null,
      })
      if (reviewError) throw reviewError

      const message = decision === 'MORE_INFO_REQUIRED'
        ? 'The customer has been asked to provide more information.'
        : `KYC application updated: ${decision}.`
      setSelected(null)
      setReviewNote('')
      setNotice(message)
      await load({ clearNotice: false })
    } catch (reviewError) {
      setError(reviewError.message || 'Unable to update the KYC application.')
    } finally {
      setSaving(false)
    }
  }

  async function openDocument(path) {
    setError('')
    const { data, error: signedUrlError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 60)
    if (signedUrlError) {
      setError(signedUrlError.message)
      return
    }
    setDocumentUrl(data.signedUrl)
  }

  if (loading) {
    return <div style={panel}>Loading KYC information…</div>
  }

  const verification = myRecord?.verification
  const needsMoreInfo = verification?.verification_status === 'PENDING' && Boolean(verification?.rejection_reason)
  const canSubmit = !verification || verification.verification_status === 'REJECTED' || needsMoreInfo

  return (
    <main className="kyc-page" style={{ width: '100%', minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: '0 0 6px', color: '#f1f6fd', fontSize: 23 }}>
            {isCustomer ? 'My KYC Verification' : 'Customer KYC Review'}
          </h2>
          <p style={{ margin: 0, color: '#8798b0', fontSize: 12 }}>
            {isCustomer
              ? 'Complete your identity verification to use the exchange services.'
              : isOfficer
                ? 'Review customer identity information and submitted documents.'
                : 'Monitor customer identity verification applications.'}
          </p>
        </div>
        <button type="button" style={secondary} onClick={() => void load()} disabled={saving}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && <Alert>{error}</Alert>}
      {notice && <Alert type="success">{notice}</Alert>}

      {isCustomer && (
        <>
          <section style={panel}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <h3 style={{ margin: '0 0 5px', color: '#e5eef9' }}>Verification status</h3>
                <p style={{ margin: 0, color: '#8292aa', fontSize: 11 }}>Your identity verification progress</p>
              </div>
              <StatusBadge status={verification?.verification_status} note={verification?.rejection_reason} />
            </div>
            {verification ? (
              <div style={{ marginTop: 15, color: '#91a4bd', fontSize: 12, lineHeight: 1.9 }}>
                <div>Submission: #{verification.submission_no ?? '—'}</div>
                <div>Submitted: {formatDate(verification.submitted_at)}</div>
                <div>Last reviewed: {formatDate(verification.reviewed_at)}</div>
                {verification.rejection_reason && (
                  <div style={{ marginTop: 8, padding: 12, borderRadius: 8, background: '#0b1525', color: '#fcd9a5' }}>
                    <strong>Officer message:</strong> {verification.rejection_reason}
                  </div>
                )}
              </div>
            ) : (
              <p style={{ margin: '14px 0 0', color: '#91a4bd', fontSize: 12, lineHeight: 1.7 }}>
                Your KYC application has not been submitted yet. Complete the form below and attach an identity document to begin verification.
              </p>
            )}
          </section>

          {canSubmit && (
            <form onSubmit={submitKyc} style={panel}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                <div style={{ display: 'grid', placeItems: 'center', width: 38, height: 38, borderRadius: 10, background: 'rgba(59,130,246,.14)', color: '#60a5fa' }}>
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, color: '#e5eef9' }}>
                    {verification ? 'Update KYC information' : 'Identity information'}
                  </h3>
                  <p style={{ margin: '4px 0 0', color: '#8292aa', fontSize: 11 }}>
                    Fields marked * are required.
                  </p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 230px), 1fr))', gap: 15 }}>
                <label style={field}>
                  Date of birth *
                  <input style={input} type="date" required max={today} value={form.date_of_birth} onChange={(event) => setForm({ ...form, date_of_birth: event.target.value })} />
                </label>
                <label style={field}>
                  Nationality *
                  <input style={input} required maxLength={80} placeholder="e.g. Thai" value={form.nationality} onChange={(event) => setForm({ ...form, nationality: event.target.value })} />
                </label>
                <label style={field}>
                  Occupation
                  <input style={input} maxLength={120} placeholder="Your occupation" value={form.occupation} onChange={(event) => setForm({ ...form, occupation: event.target.value })} />
                </label>
                <label style={field}>
                  Monthly income (THB)
                  <input style={input} type="number" min="0" step="0.01" placeholder="Optional" value={form.monthly_income} onChange={(event) => setForm({ ...form, monthly_income: event.target.value })} />
                </label>
                <label style={field}>
                  Identity document *
                  <select style={input} required value={form.document_type} onChange={(event) => setForm({ ...form, document_type: event.target.value })}>
                    <option value="PASSPORT">Passport</option>
                    <option value="NATIONAL_ID">National ID</option>
                    <option value="DRIVING_LICENSE">Driving License</option>
                  </select>
                </label>
                <label style={field}>
                  Document number (masked)
                  <input style={input} maxLength={40} placeholder="e.g. ****1234" value={form.masked_document_number} onChange={(event) => setForm({ ...form, masked_document_number: event.target.value })} />
                </label>
                <label style={field}>
                  Document expiry date
                  <input style={input} type="date" value={form.expiry_date} onChange={(event) => setForm({ ...form, expiry_date: event.target.value })} />
                </label>
                <label style={field}>
                  Upload identity document *
                  <input
                    ref={fileInputRef}
                    style={{ ...input, padding: 9 }}
                    type="file"
                    accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
                    required
                    onChange={(event) => setFile(event.target.files?.[0] || null)}
                  />
                </label>
              </div>

              <p style={{ margin: '14px 0 16px', color: '#788da8', fontSize: 11, lineHeight: 1.7 }}>
                Accepted formats: JPG, PNG or PDF. Maximum file size: 8 MB. Your identity document is stored in a private bucket and can only be accessed by you and authorized KYC staff.
              </p>
              {file && <p style={{ margin: '-5px 0 15px', color: '#93c5fd', fontSize: 11 }}>Selected file: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)</p>}
              <button type="submit" disabled={saving} style={{ ...primary, opacity: saving ? 0.65 : 1 }}>
                <UploadCloud size={16} /> {saving ? 'Submitting…' : 'Submit KYC for verification'}
              </button>
            </form>
          )}

          {verification?.verification_status === 'APPROVED' && (
            <section style={{ ...panel, borderColor: '#276044' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#86efac' }}>
                <Check size={20} />
                <strong>Your identity verification has been approved.</strong>
              </div>
              <p style={{ margin: '9px 0 0', color: '#91a4bd', fontSize: 12 }}>No further action is required at this time.</p>
            </section>
          )}

          {myRecord?.documents?.length > 0 && (
            <section style={panel}>
              <h3 style={{ margin: '0 0 12px', color: '#e5eef9' }}>Submitted documents</h3>
              {myRecord.documents.map((document) => (
                <div key={document.document_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, padding: '12px 0', borderTop: '1px solid #263850', color: '#a9bad0', fontSize: 12 }}>
                  <span><FileCheck2 size={15} style={{ verticalAlign: 'middle', marginRight: 8 }} />{document.document_type} · {document.document_status}</span>
                  <span>{formatDate(document.uploaded_at)}</span>
                </div>
              ))}
            </section>
          )}
        </>
      )}

      {!isCustomer && (
        <section style={panel}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
            <div>
              <h3 style={{ margin: 0, color: '#e5eef9' }}>{isOfficer ? 'Pending review queue' : 'KYC applications overview'}</h3>
              <p style={{ margin: '5px 0 0', color: '#8292aa', fontSize: 11 }}>{queue.length} application(s)</p>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', whiteSpace: 'nowrap' }}>
              <thead>
                <tr>
                  {['Customer', 'Email', 'Nationality', 'Submitted', 'Status', 'Action'].map((heading) => (
                    <th key={heading} style={{ padding: 12, color: '#8194ad', fontSize: 10, borderBottom: '1px solid #263850' }}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {queue.map((item) => (
                  <tr key={item.kyc_id}>
                    <td style={{ padding: 12, color: '#d5e1ef', fontSize: 12 }}>{item.customer_profiles?.users?.full_name || 'Customer'}</td>
                    <td style={{ padding: 12, color: '#a9bad0', fontSize: 12 }}>{item.customer_profiles?.users?.email || '—'}</td>
                    <td style={{ padding: 12, color: '#a9bad0', fontSize: 12 }}>{item.customer_profiles?.nationality || '—'}</td>
                    <td style={{ padding: 12, color: '#a9bad0', fontSize: 12 }}>{formatDate(item.submitted_at)}</td>
                    <td style={{ padding: 12 }}><StatusBadge status={item.verification_status} /></td>
                    <td style={{ padding: 12 }}><button type="button" style={secondary} onClick={() => { setSelected(item); setReviewNote(''); setError('') }}>Review</button></td>
                  </tr>
                ))}
                {queue.length === 0 && (
                  <tr><td colSpan="6" style={{ padding: 25, color: '#8292aa', textAlign: 'center', fontSize: 12 }}>No KYC applications found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {selected && (
        <section style={panel}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <h3 style={{ margin: 0, color: '#e5eef9' }}>Application details</h3>
            <button type="button" style={secondary} onClick={() => setSelected(null)}><X size={14} /> Close</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginTop: 16, color: '#a9bad0', fontSize: 12, lineHeight: 1.8 }}>
            <div><b>Customer:</b> {selected.customer_profiles?.users?.full_name || '—'}</div>
            <div><b>Email:</b> {selected.customer_profiles?.users?.email || '—'}</div>
            <div><b>Date of birth:</b> {selected.customer_profiles?.date_of_birth || '—'}</div>
            <div><b>Nationality:</b> {selected.customer_profiles?.nationality || '—'}</div>
            <div><b>Occupation:</b> {selected.customer_profiles?.occupation || '—'}</div>
            <div><b>Monthly income:</b> {selected.customer_profiles?.monthly_income ?? '—'}</div>
            <div><b>Submission #:</b> {selected.submission_no ?? '—'}</div>
            <div><b>Submitted:</b> {formatDate(selected.submitted_at)}</div>
          </div>

          <h4 style={{ margin: '20px 0 10px', color: '#dce7f5' }}>Identity documents</h4>
          {(selected.kyc_documents || []).map((document) => (
            <div key={document.document_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: 12, background: '#0b1525', borderRadius: 8, marginBottom: 8, color: '#b7c5d7', fontSize: 12 }}>
              <span>{document.document_type} · {document.masked_document_number || 'Number not provided'} · {document.document_status}</span>
              <button type="button" style={secondary} onClick={() => void openDocument(document.file_reference)}><Eye size={14} /> View file</button>
            </div>
          ))}
          {isOfficer && (
            <>
              <label style={{ ...field, marginTop: 16 }}>
                Review note / reason
                <textarea
                  style={{ ...input, minHeight: 85, resize: 'vertical' }}
                  value={reviewNote}
                  onChange={(event) => setReviewNote(event.target.value)}
                  placeholder="Enter a rejection reason or specify the additional information required…"
                />
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginTop: 14 }}>
                <button type="button" disabled={saving} style={{ ...primary, background: '#16834a', opacity: saving ? 0.6 : 1 }} onClick={() => void review('APPROVED')}><Check size={14} /> Approve</button>
                <button type="button" disabled={saving} style={{ ...primary, background: '#a52b3a', opacity: saving ? 0.6 : 1 }} onClick={() => void review('REJECTED')}><X size={14} /> Reject</button>
                <button type="button" disabled={saving} style={{ ...primary, background: '#9a6a19', opacity: saving ? 0.6 : 1 }} onClick={() => void review('MORE_INFO_REQUIRED')}><MessageSquare size={14} /> Request more information</button>
              </div>
            </>
          )}
        </section>
      )}

      {documentUrl && (
        <div
          role="presentation"
          onClick={() => setDocumentUrl('')}
          style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,.78)', display: 'grid', placeItems: 'center', padding: 20 }}
        >
          <div onClick={(event) => event.stopPropagation()} style={{ width: 'min(900px,95vw)', height: 'min(85vh,800px)', background: '#111d2f', padding: 12, borderRadius: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#e5eef9', marginBottom: 8, fontSize: 12 }}>
              Document preview
              <button type="button" style={secondary} onClick={() => setDocumentUrl('')}><X size={14} /> Close</button>
            </div>
            <iframe title="KYC document preview" src={documentUrl} style={{ width: '100%', height: 'calc(100% - 42px)', border: 0, background: '#fff', borderRadius: 6 }} />
          </div>
        </div>
      )}
    </main>
  )
}

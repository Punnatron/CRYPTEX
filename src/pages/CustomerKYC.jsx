import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { FileCheck2, UploadCloud, RefreshCw, Eye, Check, X, MessageSquare } from 'lucide-react'

const BUCKET = 'kyc-documents'
const panel = { background: '#111d2f', border: '1px solid #263850', borderRadius: 12, padding: 22, marginBottom: 18 }
const field = { display: 'grid', gap: 7, color: '#a9bad0', fontSize: 12, fontWeight: 600 }
const input = { width: '100%', padding: '11px 12px', color: '#e6edf7', background: '#0b1525', border: '1px solid #344761', borderRadius: 8, outline: 'none' }
const primary = { border: 0, borderRadius: 8, padding: '11px 16px', color: '#fff', background: '#2563eb', fontWeight: 700, cursor: 'pointer' }
const secondary = { border: '1px solid #344761', borderRadius: 8, padding: '10px 14px', color: '#cbd5e1', background: '#17263b', fontWeight: 600, cursor: 'pointer' }
const badgeStyle = status => ({ display: 'inline-flex', padding: '5px 9px', borderRadius: 6, fontSize: 10, fontWeight: 800, color: status === 'APPROVED' ? '#86efac' : status === 'REJECTED' ? '#fca5a5' : ['PENDING', 'MORE_INFO_REQUIRED'].includes(status) ? '#fcd34d' : '#93c5fd', background: status === 'APPROVED' ? '#123323' : status === 'REJECTED' ? '#3a1b25' : ['PENDING', 'MORE_INFO_REQUIRED'].includes(status) ? '#3b2d12' : '#142b46' })
const fmt = value => value ? new Date(value).toLocaleString() : '—'

// The database stores a request for more information as PENDING plus an officer note
// to remain compatible with the existing verification_status CHECK constraint.
function effectiveVerificationStatus(verification) {
  if (verification?.verification_status === 'PENDING' && verification?.rejection_reason) return 'MORE_INFO_REQUIRED'
  return verification?.verification_status || 'NOT SUBMITTED'
}

export default function CustomerKYC() {
  const { user, profile, role } = useAuth()
  const normalizedRole = String(role || '').toUpperCase()
  const isCustomer = normalizedRole === 'CUSTOMER'
  const isOfficer = normalizedRole === 'KYC_OFFICER'
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [myRecord, setMyRecord] = useState(null)
  const [queue, setQueue] = useState([])
  const [selected, setSelected] = useState(null)
  const [reviewNote, setReviewNote] = useState('')
  const [documentUrl, setDocumentUrl] = useState('')
  const [form, setForm] = useState({ date_of_birth: '', nationality: '', occupation: '', monthly_income: '', document_type: 'PASSPORT', masked_document_number: '', expiry_date: '' })
  const [file, setFile] = useState(null)

  const load = useCallback(async () => {
    setLoading(true); setError(''); setNotice('')
    try {
      if (isCustomer) {
        const { data: cp, error: cpError } = await supabase.from('customer_profiles').select('customer_id,date_of_birth,nationality,occupation,monthly_income,customer_status').eq('user_id', profile.user_id).maybeSingle()
        if (cpError) throw cpError
        if (!cp) { setMyRecord(null); return }
        const { data: verification, error: vError } = await supabase.from('kyc_verifications').select('kyc_id,submission_no,verification_level,verification_status,submitted_at,reviewed_at,rejection_reason').eq('customer_id', cp.customer_id).maybeSingle()
        if (vError) throw vError
        let docs = []
        if (verification) {
          const { data, error: dError } = await supabase.from('kyc_documents').select('document_id,document_type,masked_document_number,file_reference,document_status,expiry_date,uploaded_at').eq('kyc_id', verification.kyc_id).order('uploaded_at', { ascending: false })
          if (dError) throw dError
          docs = data || []
        }
        setMyRecord({ ...cp, verification, documents: docs })
        if (cp.date_of_birth) setForm(f => ({ ...f, date_of_birth: cp.date_of_birth, nationality: cp.nationality || '', occupation: cp.occupation || '', monthly_income: cp.monthly_income ?? '' }))
      } else {
        let query = supabase.from('kyc_verifications').select('kyc_id,customer_id,submission_no,verification_level,verification_status,submitted_at,reviewed_at,rejection_reason,customer_profiles!inner(customer_id,user_id,date_of_birth,nationality,occupation,monthly_income,customer_status,users!inner(full_name,email)),kyc_documents(document_id,document_type,masked_document_number,file_reference,document_status,expiry_date,uploaded_at)').order('submitted_at', { ascending: false })
        // Only fresh pending applications belong in the officer queue. A request-more-info
        // record is also stored as PENDING, but has a non-null officer note until resubmitted.
        if (isOfficer) query = query.eq('verification_status', 'PENDING').is('rejection_reason', null)
        const { data, error: qError } = await query
        if (qError) throw qError
        setQueue(data || [])
      }
    } catch (e) { setError(e.message || 'Unable to load KYC data') }
    finally { setLoading(false) }
  }, [isCustomer, isOfficer, profile?.user_id])

  useEffect(() => { if (profile?.user_id) load() }, [profile?.user_id, load])

  async function submitKyc(e) {
    e.preventDefault(); setSaving(true); setError(''); setNotice('')
    let uploadedPath = null
    try {
      if (!file) throw new Error('Please attach an identity document.')
      if (!['image/jpeg', 'image/png', 'application/pdf'].includes(file.type)) throw new Error('Only JPG, PNG or PDF files are allowed.')
      if (file.size > 8 * 1024 * 1024) throw new Error('File size must not exceed 8 MB.')
      const path = `${user.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type })
      if (uploadError) throw uploadError
      uploadedPath = path
      const { error: submitError } = await supabase.rpc('cryptex_submit_kyc', {
        p_date_of_birth: form.date_of_birth,
        p_nationality: form.nationality.trim(),
        p_occupation: form.occupation.trim() || null,
        p_monthly_income: form.monthly_income === '' ? null : Number(form.monthly_income),
        p_document_type: form.document_type,
        p_masked_document_number: form.masked_document_number.trim() || null,
        p_file_reference: path,
        p_expiry_date: form.expiry_date || null
      })
      if (submitError) throw submitError
      uploadedPath = null // The object is now referenced by kyc_documents; keep it.
      setFile(null)
      await load()
      setNotice('Your KYC application has been submitted successfully. Status: PENDING.')
    } catch (e) {
      // Avoid leaving an orphaned private-storage object if the database RPC fails.
      if (uploadedPath) {
        const { error: cleanupError } = await supabase.storage.from(BUCKET).remove([uploadedPath])
        if (cleanupError) console.warn('KYC upload cleanup failed:', cleanupError.message)
      }
      setError(e.message || 'KYC submission failed')
    }
    finally { setSaving(false) }
  }

  async function review(status) {
    if (!selected) return
    if (['REJECTED', 'MORE_INFO_REQUIRED'].includes(status) && !reviewNote.trim()) { setError(status === 'REJECTED' ? 'Please provide a reason before rejecting the application.' : 'Please describe what additional information is required.'); return }
    setSaving(true); setError(''); setNotice('')
    try {
      const { error: rpcError } = await supabase.rpc('cryptex_review_kyc', { p_kyc_id: selected.kyc_id, p_decision: status, p_reason: reviewNote.trim() || null })
      if (rpcError) throw rpcError
      setSelected(null); setReviewNote(''); await load(); setNotice(`KYC application updated: ${status}`)
    } catch (e) { setError(e.message || 'Unable to update KYC application') }
    finally { setSaving(false) }
  }

  async function openDocument(path) {
    setError('')
    const { data, error: signedError } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60)
    if (signedError) { setError(signedError.message); return }
    setDocumentUrl(data.signedUrl)
  }

  const currentKycStatus = effectiveVerificationStatus(myRecord?.verification)
  const isMoreInfoRequired = currentKycStatus === 'MORE_INFO_REQUIRED'
  const canResubmit = !myRecord?.verification || ['REJECTED', 'MORE_INFO_REQUIRED'].includes(currentKycStatus)

  if (loading) return <div style={panel}>Loading KYC information…</div>
  return <main>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 20 }}>
      <div><h2 style={{ margin: '0 0 6px', color: '#f1f6fd', fontSize: 23 }}>{isCustomer ? 'My KYC Verification' : 'Customer KYC Review'}</h2><p style={{ margin: 0, color: '#8798b0', fontSize: 12 }}>{isCustomer ? 'Submit your identity information and track verification status.' : 'Review customer identity information and submitted documents.'}</p></div>
      <button style={secondary} onClick={load}><RefreshCw size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />Refresh</button>
    </div>
    {error && <div style={{ ...panel, color: '#fecaca', borderColor: '#7f303b' }}>{error}</div>}
    {notice && <div style={{ ...panel, color: '#86efac', borderColor: '#276044' }}>{notice}</div>}

    {isCustomer && <>
      <section style={panel}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}><h3 style={{ margin: 0, color: '#e5eef9' }}>Verification status</h3><span style={badgeStyle(currentKycStatus)}>{currentKycStatus}</span></div>
        {myRecord?.verification && <div style={{ marginTop: 14, color: '#91a4bd', fontSize: 12, lineHeight: 1.9 }}>Submitted: {fmt(myRecord.verification.submitted_at)}<br/>Last reviewed: {fmt(myRecord.verification.reviewed_at)}</div>}
        {!myRecord?.verification && <p style={{ color: '#91a4bd', fontSize: 12 }}>You have not submitted your identity verification yet.</p>}
        {isMoreInfoRequired && <p style={{ margin: '14px 0 0', color: '#fcd34d', fontSize: 12, lineHeight: 1.7 }}>Additional information is required before verification can continue. Officer note: {myRecord.verification.rejection_reason}</p>}
        {currentKycStatus === 'REJECTED' && myRecord?.verification?.rejection_reason && <p style={{ margin: '14px 0 0', color: '#fca5a5', fontSize: 12, lineHeight: 1.7 }}>Application rejected. Reason: {myRecord.verification.rejection_reason}</p>}
      </section>
      {canResubmit && <form onSubmit={submitKyc} style={panel}>
        <h3 style={{ marginTop: 0, color: '#e5eef9' }}>{myRecord?.verification ? 'Update and resubmit KYC information' : 'Identity information'}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 15 }}>
          <label style={field}>Date of birth<input style={input} type="date" required value={form.date_of_birth} onChange={e => setForm({ ...form, date_of_birth: e.target.value })} /></label>
          <label style={field}>Nationality<input style={input} required maxLength={80} placeholder="e.g. Thai" value={form.nationality} onChange={e => setForm({ ...form, nationality: e.target.value })} /></label>
          <label style={field}>Occupation<input style={input} placeholder="Occupation (optional)" value={form.occupation} onChange={e => setForm({ ...form, occupation: e.target.value })} /></label>
          <label style={field}>Monthly income (THB)<input style={input} type="number" min="0" step="0.01" value={form.monthly_income} onChange={e => setForm({ ...form, monthly_income: e.target.value })} /></label>
          <label style={field}>Identity document<select style={input} value={form.document_type} onChange={e => setForm({ ...form, document_type: e.target.value })}><option value="PASSPORT">Passport</option><option value="NATIONAL_ID">National ID</option><option value="DRIVING_LICENSE">Driving License</option></select></label>
          <label style={field}>Document number (masked)<input style={input} placeholder="e.g. ****1234" value={form.masked_document_number} onChange={e => setForm({ ...form, masked_document_number: e.target.value })} /></label>
          <label style={field}>Document expiry date<input style={input} type="date" value={form.expiry_date} onChange={e => setForm({ ...form, expiry_date: e.target.value })} /></label>
          <label style={field}>Upload document (JPG, PNG, PDF · max 8 MB)<input style={{ ...input, padding: 9 }} type="file" accept="image/jpeg,image/png,application/pdf" required onChange={e => setFile(e.target.files?.[0] || null)} /></label>
        </div>
        <p style={{ color: '#788da8', fontSize: 11, lineHeight: 1.6 }}>Please upload a clear image or PDF of your identity document. Your document is stored in a private bucket and is only accessible to you and authorized KYC staff.</p>
        <button disabled={saving} style={{ ...primary, opacity: saving ? .6 : 1 }}><UploadCloud size={15} style={{ verticalAlign: 'middle', marginRight: 7 }} />{saving ? 'Submitting…' : myRecord?.verification ? 'Resubmit KYC for verification' : 'Submit KYC for verification'}</button>
      </form>}
      {myRecord?.documents?.length > 0 && <section style={panel}><h3 style={{ marginTop: 0, color: '#e5eef9' }}>Submitted documents</h3>{myRecord.documents.map(doc => <div key={doc.document_id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '12px 0', borderTop: '1px solid #263850', color: '#a9bad0', fontSize: 12 }}><span><FileCheck2 size={15} style={{ verticalAlign: 'middle', marginRight: 8 }} />{doc.document_type} · {doc.document_status}</span><span>{fmt(doc.uploaded_at)}</span></div>)}</section>}
    </>}

    {!isCustomer && <section style={panel}>
      <h3 style={{ marginTop: 0, color: '#e5eef9' }}>{isOfficer ? 'Pending review queue' : 'KYC applications overview'}</h3>
      <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', whiteSpace: 'nowrap' }}><thead><tr>{['Customer','Email','Nationality','Submitted','Status','Action'].map(x => <th key={x} style={{ padding: 12, color: '#8194ad', fontSize: 10, borderBottom: '1px solid #263850' }}>{x}</th>)}</tr></thead><tbody>
        {queue.map(item => <tr key={item.kyc_id}><td style={{ padding: 12, color: '#d5e1ef', fontSize: 12 }}>{item.customer_profiles?.users?.full_name || 'Customer'}</td><td style={{ padding: 12, color: '#a9bad0', fontSize: 12 }}>{item.customer_profiles?.users?.email || '—'}</td><td style={{ padding: 12, color: '#a9bad0', fontSize: 12 }}>{item.customer_profiles?.nationality}</td><td style={{ padding: 12, color: '#a9bad0', fontSize: 12 }}>{fmt(item.submitted_at)}</td><td style={{ padding: 12 }}><span style={badgeStyle(effectiveVerificationStatus(item))}>{effectiveVerificationStatus(item)}</span></td><td style={{ padding: 12 }}><button style={secondary} onClick={() => { setSelected(item); setReviewNote('') }}>Review</button></td></tr>)}
        {queue.length === 0 && <tr><td colSpan="6" style={{ padding: 25, color: '#8292aa', textAlign: 'center' }}>No KYC applications found.</td></tr>}
      </tbody></table></div>
    </section>}

    {selected && <section style={panel}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><h3 style={{ marginTop: 0, color: '#e5eef9' }}>Application details</h3><button style={secondary} onClick={() => setSelected(null)}>Close</button></div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12, color: '#a9bad0', fontSize: 12, lineHeight: 1.8 }}><div><b>Customer:</b> {selected.customer_profiles?.users?.full_name}</div><div><b>Email:</b> {selected.customer_profiles?.users?.email}</div><div><b>Date of birth:</b> {selected.customer_profiles?.date_of_birth}</div><div><b>Nationality:</b> {selected.customer_profiles?.nationality}</div><div><b>Occupation:</b> {selected.customer_profiles?.occupation || '—'}</div><div><b>Monthly income:</b> {selected.customer_profiles?.monthly_income ?? '—'}</div><div><b>Submission #:</b> {selected.submission_no}</div><div><b>Submitted:</b> {fmt(selected.submitted_at)}</div></div>
      <h4 style={{ color: '#dce7f5' }}>Identity documents</h4>
      {(selected.kyc_documents || []).map(doc => <div key={doc.document_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 12, background: '#0b1525', borderRadius: 8, marginBottom: 8, color: '#b7c5d7', fontSize: 12 }}><span>{doc.document_type} · {doc.masked_document_number || 'Number not provided'} · {doc.document_status}</span><button style={secondary} onClick={() => openDocument(doc.file_reference)}><Eye size={14} style={{ verticalAlign: 'middle', marginRight: 5 }} />View file</button></div>)}
      {isOfficer && <><label style={{ ...field, marginTop: 16 }}>Review note / rejection reason<textarea style={{ ...input, minHeight: 80, resize: 'vertical' }} value={reviewNote} onChange={e => setReviewNote(e.target.value)} placeholder="Enter reason or additional information request…" /></label><div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginTop: 14 }}><button disabled={saving} style={{ ...primary, background: '#16834a' }} onClick={() => review('APPROVED')}><Check size={14} style={{ verticalAlign: 'middle', marginRight: 5 }} />Approve</button><button disabled={saving} style={{ ...primary, background: '#a52b3a' }} onClick={() => review('REJECTED')}><X size={14} style={{ verticalAlign: 'middle', marginRight: 5 }} />Reject</button><button disabled={saving} style={{ ...primary, background: '#9a6a19' }} onClick={() => review('MORE_INFO_REQUIRED')}><MessageSquare size={14} style={{ verticalAlign: 'middle', marginRight: 5 }} />Request more information</button></div></>}
    </section>}
    {documentUrl && <div onClick={() => setDocumentUrl('')} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,.78)', display: 'grid', placeItems: 'center', padding: 20 }}><div onClick={e => e.stopPropagation()} style={{ width: 'min(900px,95vw)', height: 'min(85vh,800px)', background: '#111d2f', padding: 12, borderRadius: 12 }}><div style={{ display: 'flex', justifyContent: 'space-between', color: '#e5eef9', marginBottom: 8 }}>Document preview <button style={secondary} onClick={() => setDocumentUrl('')}>Close</button></div><iframe title="KYC document" src={documentUrl} style={{ width: '100%', height: 'calc(100% - 42px)', border: 0, background: '#fff' }} /></div></div>}
  </main>
}

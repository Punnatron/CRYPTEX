import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  MessageCircle,
  X,
  Send,
  Bot,
  User,
  Minimize2,
  LoaderCircle,
  Sparkles,
  Database,
  ChevronDown,
} from 'lucide-react'
import './Chatbot.css'

const ROLE_SUGGESTIONS = {
  ADMIN: [
    'ลูกค้าคนใดบ้างที่ผ่านการตรวจสอบ KYC ล่าสุด?',
    'สรุปจำนวนธุรกรรมแยกตามสินทรัพย์และประเภท',
    'มี AML Alerts แยกตามระดับความรุนแรงกี่รายการ?',
  ],
  KYC_OFFICER: [
    'ลูกค้าคนใดบ้างที่ผ่านการตรวจสอบ KYC ล่าสุด?',
    'มีลูกค้าแต่ละสถานะ KYC จำนวนเท่าไร?',
    'ลูกค้ากลุ่มใดมี Customer Risk ระดับ HIGH?',
  ],
  AML_ANALYST: [
    'มี AML Alerts แยกตามระดับความรุนแรงกี่รายการ?',
    'แสดง AML Alerts ล่าสุดพร้อม Case ที่เกี่ยวข้อง',
    'Blockchain Address ใดมี Risk Score สูงที่สุด?',
    'สรุปจำนวนธุรกรรมแยกตามสินทรัพย์และประเภท',
  ],
  CUSTOMER: [
    'สถานะ KYC ของฉันเป็นอย่างไร?',
    'ยอดสินทรัพย์ในบัญชีของฉันมีเท่าไร?',
    'แสดงธุรกรรมล่าสุดของฉัน',
  ],
}

const INITIAL_MESSAGE = 'สวัสดีครับ ผมคือ CRYPTEX AI สามารถช่วยตอบคำถามเกี่ยวกับระบบและค้นหาข้อมูลตามสิทธิ์ Role ของคุณได้'

function formatCell(value) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

function EvidencePanel({ evidence }) {
  if (!evidence) return null
  const rows = Array.isArray(evidence.rows) ? evidence.rows : []
  const columns = Array.isArray(evidence.columns) && evidence.columns.length
    ? evidence.columns
    : (rows[0] ? Object.keys(rows[0]) : [])

  return (
    <section className="chat-evidence">
      <div className="chat-evidence-heading">
        <span className="chat-evidence-title"><Database size={14} /> Database Evidence</span>
        <span className="chat-evidence-count">{evidence.resultRowCount ?? evidence.sourceRowCount ?? rows.length} rows</span>
      </div>
      <div className="chat-evidence-source">
        <span>Tool: <strong>{evidence.tool}</strong></span>
        <span>View: <strong>{evidence.view}</strong></span>
      </div>
      {evidence.note && <p className="chat-evidence-note">{evidence.note}</p>}

      <details className="chat-evidence-details">
        <summary><ChevronDown size={13} /> SQL / View Query</summary>
        <pre>{evidence.sql}</pre>
      </details>

      {rows.length > 0 ? (
        <div className="chat-evidence-table-wrap">
          <table className="chat-evidence-table">
            <thead>
              <tr>{columns.map(column => <th key={column}>{column}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {columns.map(column => <td key={column}>{formatCell(row[column])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="chat-evidence-empty">ไม่พบแถวข้อมูลในขอบเขตที่บัญชีนี้มีสิทธิ์อ่าน</p>
      )}
      <div className="chat-evidence-footnote">
        แสดง {evidence.displayedRowCount ?? rows.length} แถว
        {typeof evidence.sourceRowCount === 'number' ? ` จากข้อมูลต้นทาง ${evidence.sourceRowCount} แถว` : ''}
        {evidence.aggregationNote ? ` · ${evidence.aggregationNote}` : ''}
      </div>
    </section>
  )
}

export default function Chatbot() {
  const { session, profile, role, accountStatus } = useAuth()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [messages, setMessages] = useState([
    { role: 'assistant', content: INITIAL_MESSAGE },
  ])
  const bottomRef = useRef(null)
  const suggestions = ROLE_SUGGESTIONS[role] || ROLE_SUGGESTIONS.CUSTOMER

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open])

  async function sendMessage(text = input) {
    const question = text.trim()
    if (!question || sending) return

    if (!session?.access_token || !profile || accountStatus !== 'ACTIVE') {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'ไม่สามารถตรวจสอบ Session หรือสิทธิ์ของบัญชีได้ กรุณาเข้าสู่ระบบใหม่อีกครั้ง',
      }])
      return
    }

    setInput('')
    const previousMessages = messages.slice(-8).map(item => ({
      role: item.role,
      content: item.content,
    }))

    setMessages(prev => [...prev, { role: 'user', content: question }])
    setSending(true)

    try {
      const { supabase } = await import('../lib/supabase')
      const { data, error } = await supabase.functions.invoke('cryptex-chat', {
        body: { message: question, history: previousMessages },
      })

      if (error) {
        let details = error.message || 'ไม่สามารถเรียก Chat service ได้'
        if (error.context) {
          try {
            const body = await error.context.json()
            if (body?.error) details = body.error
          } catch {
            // Keep the SDK message if the response body is not JSON.
          }
        }
        throw new Error(details)
      }

      if (!data?.reply || typeof data.reply !== 'string') {
        throw new Error(data?.error || 'Chat service ไม่ได้ส่งคำตอบกลับมา')
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.reply,
        evidence: data.evidence || null,
      }])
    } catch (error) {
      console.error('CRYPTEX Chatbot Error:', error)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `ขออภัย ระบบ Chat ไม่สามารถประมวลผลได้ในขณะนี้: ${error.message || 'Unknown error'}`,
      }])
    } finally {
      setSending(false)
    }
  }

  if (!session || !profile || accountStatus !== 'ACTIVE') return null

  return (
    <>
      {!open && (
        <button
          className="chatbot-launcher"
          onClick={() => setOpen(true)}
          aria-label="Open CRYPTEX AI Assistant"
        >
          <MessageCircle size={24} />
          <span>AI Assistant</span>
        </button>
      )}

      {open && (
        <section className="chatbot-window">
          <header className="chatbot-header">
            <div className="chatbot-brand">
              <div className="chatbot-brand-icon"><Bot size={21} /></div>
              <div>
                <strong>CRYPTEX AI</strong>
                <span><i /> Online · {role}</span>
              </div>
            </div>
            <div className="chatbot-header-actions">
              <button onClick={() => setOpen(false)} aria-label="Minimize"><Minimize2 size={17} /></button>
              <button onClick={() => setOpen(false)} aria-label="Close"><X size={19} /></button>
            </div>
          </header>

          <div className="chatbot-messages">
            <div className="chatbot-date">GROQ AI · ROLE-BASED DATABASE ASSISTANT</div>

            {messages.map((item, index) => (
              <div className={`chat-message ${item.role}`} key={index}>
                <div className="chat-message-avatar">
                  {item.role === 'assistant' ? <Bot size={17} /> : <User size={17} />}
                </div>
                <div className="chat-message-body">
                  <div className="chat-message-content">{item.content}</div>
                  {item.role === 'assistant' && item.evidence && <EvidencePanel evidence={item.evidence} />}
                </div>
              </div>
            ))}

            {messages.length === 1 && (
              <div className="chatbot-suggestions">
                <span>คำถามแนะนำสำหรับ {role}</span>
                {suggestions.map(item => (
                  <button key={item} onClick={() => sendMessage(item)}>
                    <Sparkles size={13} /> {item}
                  </button>
                ))}
              </div>
            )}

            {sending && (
              <div className="chat-message assistant">
                <div className="chat-message-avatar"><Bot size={17} /></div>
                <div className="chat-message-content typing">
                  <LoaderCircle size={15} className="chatbot-spinner" /> กำลังค้นหาข้อมูลและประมวลผล...
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <form
            className="chatbot-input-area"
            onSubmit={event => {
              event.preventDefault()
              sendMessage()
            }}
          >
            <input
              value={input}
              onChange={event => setInput(event.target.value)}
              placeholder="ถาม CRYPTEX AI เป็นภาษาไทยหรืออังกฤษ..."
              disabled={sending}
              maxLength={1000}
            />
            <button type="submit" disabled={!input.trim() || sending} aria-label="Send message">
              <Send size={18} />
            </button>
          </form>

          <footer className="chatbot-footer">
            CRYPTEX AI · Supabase RLS จำกัดข้อมูลตาม Role ของคุณ
          </footer>
        </section>
      )}
    </>
  )
}

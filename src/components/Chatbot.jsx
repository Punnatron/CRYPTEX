
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
  Sparkles
} from 'lucide-react'
import './Chatbot.css'

const SUGGESTIONS = [
  'What can you help me with?',
  'Explain KYC and AML',
  'What is blockchain transaction monitoring?'
]

export default function Chatbot() {
  const { session, profile, role, accountStatus } = useAuth()

  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)

  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content:
        'Hello! I am CRYPTEX AI Assistant. Ask me about digital assets, KYC, AML, and blockchain monitoring.'
    }
  ])

  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: 'smooth'
    })
  }, [messages, open])

  async function sendMessage(text = input) {
    const question = text.trim()

    if (!question || sending) return

    if (!session?.access_token || !profile || accountStatus !== 'ACTIVE') {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content:
            'Your account session or permissions could not be verified. Please sign in again.'
        }
      ])
      return
    }

    setInput('')

    const previousMessages = messages.slice(-8).map(item => ({
      role: item.role,
      content: item.content
    }))

    setMessages(prev => [
      ...prev,
      {
        role: 'user',
        content: question
      }
    ])

    setSending(true)

    try {
      const { supabase } = await import('../lib/supabase')

      const { data, error } = await supabase.functions.invoke(
        'cryptex-chat',
        {
          body: {
            message: question,
            history: previousMessages
          }
        }
      )

      console.log('CRYPTEX Chatbot response:', data)
      console.log('CRYPTEX Chatbot error:', error)

      if (error) {
        let errorDetails = error.message || 'Unknown Supabase error'

        if (error.context) {
          try {
            const responseBody = await error.context.json()
            errorDetails += ` | Details: ${JSON.stringify(responseBody)}`
          } catch {
            // Response body may not be JSON
          }
        }

        throw new Error(errorDetails)
      }

      if (data?.reply && typeof data.reply === 'string') {
        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: data.reply
          }
        ])
      } else {
        const debugMessage = data
          ? JSON.stringify(data, null, 2)
          : 'The Edge Function returned an empty response.'

        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: `DEBUG: No reply received from the server.\n\n${debugMessage}`
          }
        ])
      }
    } catch (error) {
      console.error('CRYPTEX Chatbot Error:', error)

      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `DEBUG ERROR:\n${error.message || 'Unknown error'}`
        }
      ])
    } finally {
      setSending(false)
    }
  }

  if (!session || !profile || accountStatus !== 'ACTIVE') {
    return null
  }

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
              <div className="chatbot-brand-icon">
                <Bot size={21} />
              </div>

              <div>
                <strong>CRYPTEX AI</strong>
                <span>
                  <i /> Online · {role}
                </span>
              </div>
            </div>

            <div className="chatbot-header-actions">
              <button
                onClick={() => setOpen(false)}
                aria-label="Minimize"
              >
                <Minimize2 size={17} />
              </button>

              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                <X size={19} />
              </button>
            </div>
          </header>

          <div className="chatbot-messages">
            <div className="chatbot-date">
              AI-POWERED EXCHANGE ASSISTANT
            </div>

            {messages.map((item, index) => (
              <div
                className={`chat-message ${item.role}`}
                key={index}
              >
                <div className="chat-message-avatar">
                  {item.role === 'assistant' ? (
                    <Bot size={17} />
                  ) : (
                    <User size={17} />
                  )}
                </div>

                <div className="chat-message-content">
                  {item.content}
                </div>
              </div>
            ))}

            {messages.length === 1 && (
              <div className="chatbot-suggestions">
                <span>Suggested questions</span>

                {SUGGESTIONS.map(item => (
                  <button
                    key={item}
                    onClick={() => sendMessage(item)}
                  >
                    <Sparkles size={13} />
                    {item}
                  </button>
                ))}
              </div>
            )}

            {sending && (
              <div className="chat-message assistant">
                <div className="chat-message-avatar">
                  <Bot size={17} />
                </div>

                <div className="chat-message-content typing">
                  <LoaderCircle
                    size={15}
                    className="chatbot-spinner"
                  />
                  Thinking...
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
              placeholder="Ask CRYPTEX AI..."
              disabled={sending}
              maxLength={1000}
            />

            <button
              type="submit"
              disabled={!input.trim() || sending}
            >
              <Send size={18} />
            </button>
          </form>

          <footer className="chatbot-footer">
            CRYPTEX AI · Responses may require verification
          </footer>
        </section>
      )}
    </>
  )
}

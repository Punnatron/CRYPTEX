
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function Login() {
  const navigate = useNavigate()
  const { signIn, signUp } = useAuth()

  const [mode, setMode] = useState('login')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const isRegister = mode === 'register'

  async function handleSubmit(event) {
    event.preventDefault()

    setLoading(true)
    setMessage('')
    setError('')

    try {
      let result

      if (isRegister) {
        result = await signUp({
          email,
          password,
          fullName
        })
      } else {
        result = await signIn({
          email,
          password
        })
      }

      if (result.error) {
        throw result.error
      }

      if (isRegister) {
        if (result.data.session) {
          setMessage('สมัครสมาชิกสำเร็จ!')
          navigate('/dashboard', { replace: true })
        } else {
          setMessage(
            'สมัครสมาชิกสำเร็จ กรุณาตรวจสอบอีเมลเพื่อยืนยันบัญชี'
          )
        }
      } else {
        setMessage('เข้าสู่ระบบสำเร็จ!')
        navigate('/dashboard', { replace: true })
      }
    } catch (err) {
      setError(
        err.message || 'เกิดข้อผิดพลาด กรุณาลองอีกครั้ง'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <div style={styles.logo}>A</div>

        <p style={styles.eyebrow}>
          AIE313 DATABASE PROJECT
        </p>

        <h1 style={styles.title}>
          {isRegister ? 'Create Account' : 'Welcome Back'}
        </h1>

        <p style={styles.subtitle}>
          {isRegister
            ? 'Create your Digital Asset Management account'
            : 'Sign in to your Digital Asset Management system'}
        </p>

        <div style={styles.tabs}>
          <button
            type="button"
            onClick={() => {
              setMode('login')
              setMessage('')
              setError('')
            }}
            style={{
              ...styles.tab,
              ...(mode === 'login' ? styles.activeTab : {})
            }}
          >
            Login
          </button>

          <button
            type="button"
            onClick={() => {
              setMode('register')
              setMessage('')
              setError('')
            }}
            style={{
              ...styles.tab,
              ...(mode === 'register' ? styles.activeTab : {})
            }}
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          {isRegister && (
            <label style={styles.label}>
              Full Name
              <input
                type="text"
                placeholder="Enter your full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                style={styles.input}
              />
            </label>
          )}

          <label style={styles.label}>
            Email Address
            <input
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              style={styles.input}
            />
          </label>

          <label style={styles.label}>
            Password
            <input
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={
                isRegister ? 'new-password' : 'current-password'
              }
              style={styles.input}
            />
          </label>

          {error && (
            <p style={styles.error}>{error}</p>
          )}

          {message && (
            <p style={styles.success}>{message}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              ...styles.submit,
              opacity: loading ? 0.65 : 1
            }}
          >
            {loading
              ? 'Please wait...'
              : isRegister
                ? 'Create Account'
                : 'Sign In'}
          </button>
        </form>

        <p style={styles.footer}>
          Digital Asset KYC, AML & Blockchain Monitoring System
        </p>
      </section>
    </main>
  )
}

const styles = {
  page: {
    minHeight: '100vh',
    background: '#0b1120',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    fontFamily: 'Arial, sans-serif'
  },
  card: {
    width: '100%',
    maxWidth: '440px',
    background: '#151f32',
    border: '1px solid #29374d',
    borderRadius: '16px',
    padding: '36px',
    boxSizing: 'border-box',
    color: '#f8fafc'
  },
  logo: {
    width: '44px',
    height: '44px',
    borderRadius: '12px',
    background: '#2563eb',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '24px',
    fontWeight: 'bold',
    marginBottom: '22px'
  },
  eyebrow: {
    color: '#60a5fa',
    fontSize: '11px',
    letterSpacing: '1.5px',
    fontWeight: 'bold'
  },
  title: {
    fontSize: '28px',
    margin: '12px 0 8px'
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: '14px',
    lineHeight: 1.6
  },
  tabs: {
    display: 'flex',
    background: '#0b1120',
    padding: '4px',
    borderRadius: '9px',
    margin: '28px 0 24px'
  },
  tab: {
    flex: 1,
    padding: '11px',
    border: 'none',
    borderRadius: '7px',
    background: 'transparent',
    color: '#94a3b8',
    cursor: 'pointer',
    fontWeight: 'bold'
  },
  activeTab: {
    background: '#2563eb',
    color: '#ffffff'
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '17px'
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    color: '#cbd5e1',
    fontSize: '13px',
    fontWeight: 'bold'
  },
  input: {
    padding: '13px',
    background: '#0b1120',
    border: '1px solid #334155',
    borderRadius: '8px',
    color: '#ffffff',
    fontSize: '14px',
    outline: 'none'
  },
  submit: {
    padding: '14px',
    border: 'none',
    borderRadius: '8px',
    background: '#2563eb',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: 'bold',
    cursor: 'pointer',
    marginTop: '5px'
  },
  error: {
    color: '#fca5a5',
    fontSize: '13px',
    margin: 0
  },
  success: {
    color: '#86efac',
    fontSize: '13px',
    margin: 0
  },
  footer: {
    marginTop: '28px',
    paddingTop: '18px',
    borderTop: '1px solid #29374d',
    color: '#64748b',
    fontSize: '11px',
    textAlign: 'center',
    lineHeight: 1.5
  }
}

export default Login

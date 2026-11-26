import { Link } from 'react-router-dom'
import { ShieldX } from 'lucide-react'

function AccessDenied() {
  return (
    <main className="access-denied-page">
      <ShieldX size={42} />
      <h1>Access Denied</h1>
      <p>Your account does not have permission to access this page.</p>
      <Link to="/dashboard">Return to Dashboard</Link>
    </main>
  )
}

export default AccessDenied

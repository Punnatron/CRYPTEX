import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState(null)
  const [profileLoading, setProfileLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function loadSession() {
      const { data, error } = await supabase.auth.getSession()
      if (!active) return
      if (error) console.error('Session error:', error.message)
      setSession(data?.session ?? null)
      setLoading(false)
    }

    loadSession()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setLoading(false)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    let active = true
    async function loadProfile() {
      const authUserId = session?.user?.id
      setProfile(null)
      if (!authUserId) {
        setProfileLoading(false)
        return
      }
      setProfileLoading(true)
      const { data, error } = await supabase
        .from('users')
        .select('user_id, auth_user_id, email, full_name, role, account_status')
        .eq('auth_user_id', authUserId)
        .maybeSingle()
      if (!active) return
      if (error) {
        console.error('Profile error:', error.message)
        setProfile(null)
      } else {
        setProfile(data ?? null)
      }
      setProfileLoading(false)
    }
    loadProfile()
    return () => { active = false }
  }, [session?.user?.id])

  const signIn = async ({ email, password }) => supabase.auth.signInWithPassword({ email, password })
  const signUp = async ({ email, password, fullName }) => supabase.auth.signUp({
    email, password, options: { data: { full_name: fullName } }
  })
  const signOut = async () => supabase.auth.signOut()

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    role: profile?.role ? String(profile.role).trim().toUpperCase() : null,
    accountStatus: profile?.account_status ? String(profile.account_status).trim().toUpperCase() : null,
    loading,
    profileLoading,
    signIn,
    signUp,
    signOut
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}

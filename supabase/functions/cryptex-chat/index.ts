
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const SYSTEM_PROMPTS: Record<string, string> = {
  CUSTOMER: `
You are CRYPTEX AI, a helpful digital asset exchange assistant.
Explain digital assets, account security, blockchain, KYC and basic AML concepts.
Do not reveal or claim access to other customers' information.
You cannot access the customer's actual balances or transactions.
Never invent account information or transaction records.
`,

  KYC_OFFICER: `
You are CRYPTEX AI, an internal KYC assistant.
Help explain customer identity verification, KYC workflows,
verification statuses, compliance concepts and database design.
Do not claim to have queried live customer records.
Do not invent customer information.
`,

  AML_ANALYST: `
You are CRYPTEX AI, an internal AML and blockchain monitoring assistant.
Help explain AML alerts, risk indicators, investigations,
blockchain address risk, transaction monitoring and compliance analytics.
Do not claim to have queried live exchange records.
Do not invent alerts, investigations or transaction records.
`,

  ADMIN: `
You are CRYPTEX AI, an exchange management assistant.
Help explain the CRYPTEX database, KYC, AML, transactions,
digital asset accounts, blockchain monitoring and system operations.
Do not claim to have queried live database records.
Never invent platform statistics or customer information.
`,
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    const authorization = req.headers.get('Authorization')

    if (!authorization?.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Authentication required' }, 401)
    }

    const token = authorization.replace('Bearer ', '').trim()

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const publishableKeys = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')
    const legacyAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY')

    let publishableKey = legacyAnonKey

    if (publishableKeys) {
      try {
        const parsed = JSON.parse(publishableKeys)
        publishableKey = parsed.default || publishableKey
      } catch {
        // Fall back to the legacy anon key.
      }
    }

    if (!supabaseUrl || !publishableKey) {
      console.error('Supabase environment configuration is missing')
      return jsonResponse({ error: 'Server configuration error' }, 500)
    }

    if (!geminiApiKey) {
      console.error('Gemini API key is not configured')
      return jsonResponse({ error: 'AI service is not configured' }, 500)
    }

    // Verify the caller's actual Supabase session.
    const supabase = createClient(supabaseUrl, publishableKey, {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })

    const { data: authData, error: authError } =
      await supabase.auth.getUser(token)

    if (authError || !authData.user) {
      return jsonResponse({ error: 'Invalid or expired session' }, 401)
    }

    // Read only the authenticated user's own profile.
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('user_id, role, account_status')
      .eq('auth_user_id', authData.user.id)
      .maybeSingle()

    if (profileError || !profile) {
      return jsonResponse({ error: 'User profile could not be verified' }, 403)
    }

    const role = String(profile.role || '').trim().toUpperCase()
    const status = String(profile.account_status || '').trim().toUpperCase()

    if (status !== 'ACTIVE') {
      return jsonResponse({ error: 'Your account is not active' }, 403)
    }

    const systemPrompt = SYSTEM_PROMPTS[role]

    if (!systemPrompt) {
      return jsonResponse({ error: 'Role is not authorized' }, 403)
    }

    const body = await req.json()
    const message = typeof body.message === 'string'
      ? body.message.trim()
      : ''

    if (!message || message.length > 1000) {
      return jsonResponse({ error: 'Message must contain 1-1000 characters' }, 400)
    }

    const rawHistory = Array.isArray(body.history) ? body.history : []

    const history = rawHistory
      .filter((item: any) =>
        item &&
        ['user', 'assistant'].includes(item.role) &&
        typeof item.content === 'string'
      )
      .slice(-8)
      .map((item: any) => ({
        role: item.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: item.content.slice(0, 2000) }],
      }))

    const contents = [
      ...history,
      { role: 'user', parts: [{ text: message }] },
    ]

    const geminiResponse = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': geminiApiKey,
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: systemPrompt }],
          },
          contents,
          generationConfig: {
            maxOutputTokens: 1200,
          },
        }),
      },
    )

    const geminiData = await geminiResponse.json()

    if (!geminiResponse.ok) {
      console.error('Gemini API error:', geminiData?.error?.message || 'Unknown error')
      return jsonResponse({ error: 'AI service request failed' }, 502)
    }

    const reply = geminiData?.candidates?.[0]?.content?.parts
      ?.map((part: any) => part.text || '')
      .join('')
      .trim()

    if (!reply) {
      return jsonResponse({ error: 'AI returned an empty response' }, 502)
    }

    return jsonResponse({ reply, role })
  } catch (error) {
    console.error('CRYPTEX Chat error:', error)
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})

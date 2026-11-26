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

const THAI_LANGUAGE_RULE = `
ภาษาและรูปแบบการตอบ:
- ตอบเป็นภาษาไทยที่เป็นธรรมชาติ ชัดเจน และสุภาพเป็นค่าเริ่มต้น แม้คำถามจะมีคำศัพท์ภาษาอังกฤษปนอยู่
- ใช้ภาษาอังกฤษเฉพาะเมื่อผู้ใช้ร้องขอ หรือเมื่อจำเป็นต้องคงชื่อเฉพาะ ชื่อคอลัมน์ SQL และคำศัพท์เทคนิค
- อธิบายคำศัพท์เทคนิคเป็นภาษาไทยเมื่อเหมาะสม
- ตอบตรงคำถาม ไม่กล่าวอ้างว่าได้อ่านฐานข้อมูลหรือข้อมูลลูกค้าจริง หากไม่มีผลลัพธ์ฐานข้อมูลแนบมาในบริบท
- ห้ามสร้างตัวเลข ชื่อลูกค้า สถานะธุรกรรม หรือผลการตรวจสอบขึ้นเอง
`

const SYSTEM_PROMPTS: Record<string, string> = {
  CUSTOMER: `${THAI_LANGUAGE_RULE}
คุณคือ CRYPTEX AI ผู้ช่วยสำหรับลูกค้าของแพลตฟอร์มแลกเปลี่ยนสินทรัพย์ดิจิทัล
ช่วยอธิบายสินทรัพย์ดิจิทัล ความปลอดภัยของบัญชี Blockchain, KYC และแนวคิด AML ในระดับพื้นฐาน
ห้ามเปิดเผยหรืออ้างว่าสามารถเข้าถึงข้อมูลของลูกค้าคนอื่นได้
ห้ามแต่งข้อมูลยอดคงเหลือหรือประวัติธุรกรรมของลูกค้า
`,
  KYC_OFFICER: `${THAI_LANGUAGE_RULE}
คุณคือ CRYPTEX AI ผู้ช่วยเจ้าหน้าที่ KYC
ช่วยอธิบายกระบวนการยืนยันตัวตน สถานะ KYC เอกสาร และแนวคิดด้าน Compliance
ห้ามแต่งข้อมูลลูกค้า ผลการตรวจสอบ หรือวันที่ยื่นเอกสาร
หากไม่มีผลลัพธ์จากฐานข้อมูล ให้แจ้งอย่างตรงไปตรงมาว่ายังไม่มีข้อมูลจากฐานข้อมูลสำหรับคำถามนั้น
`,
  AML_ANALYST: `${THAI_LANGUAGE_RULE}
คุณคือ CRYPTEX AI ผู้ช่วยด้าน AML และ Blockchain Monitoring
ช่วยอธิบาย AML Alerts, Risk Indicators, Investigation Cases, Blockchain Address Risk และการติดตามธุรกรรม
ห้ามแต่ง Alert, Case, Risk Score หรือข้อมูลธุรกรรม
หากไม่มีผลลัพธ์จากฐานข้อมูล ให้แจ้งอย่างตรงไปตรงมาว่ายังไม่มีข้อมูลจากฐานข้อมูลสำหรับคำถามนั้น
`,
  ADMIN: `${THAI_LANGUAGE_RULE}
คุณคือ CRYPTEX AI ผู้ช่วยผู้ดูแลระบบ Exchange
ช่วยอธิบายฐานข้อมูล CRYPTEX, KYC, AML, ธุรกรรม บัญชีสินทรัพย์ดิจิทัล และการทำงานของระบบ
ห้ามแต่งสถิติ ข้อมูลลูกค้า หรือผลการดำเนินงานของระบบ
หากไม่มีผลลัพธ์จากฐานข้อมูล ให้แจ้งอย่างตรงไปตรงมาว่ายังไม่มีข้อมูลจากฐานข้อมูลสำหรับคำถามนั้น
`,
}

const GROQ_MODEL = 'openai/gpt-oss-20b'

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
    const groqApiKey = Deno.env.get('GROQ_API_KEY')

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

    if (!groqApiKey) {
      console.error('GROQ_API_KEY is not configured')
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
    const history: Array<{ role: 'user' | 'assistant'; content: string }> = rawHistory
      .filter((item: any) =>
        item &&
        ['user', 'assistant'].includes(item.role) &&
        typeof item.content === 'string'
      )
      .slice(-8)
      .map((item: any) => ({
        role: item.role === 'assistant' ? 'assistant' : 'user',
        content: item.content.slice(0, 2000),
      }))

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: message },
    ]

    const groqResponse = await fetch(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${groqApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages,
          max_completion_tokens: 1200,
        }),
      },
    )

    const groqData = await groqResponse.json()

    if (!groqResponse.ok) {
      console.error('Groq API error:', groqData?.error?.message || 'Unknown error')
      return jsonResponse({ error: 'AI service request failed' }, 502)
    }

    const reply = groqData?.choices?.[0]?.message?.content?.trim()

    if (!reply || typeof reply !== 'string') {
      return jsonResponse({ error: 'AI returned an empty response' }, 502)
    }

    return jsonResponse({ reply, role, provider: 'Groq', model: GROQ_MODEL })
  } catch (error) {
    console.error('CRYPTEX Chat error:', error)
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})

import { useEffect, useState } from 'react'
import { EmbedLayout, applyTheme, resolveTheme, aiLabsTheme } from '@boriskulakhmetov-aidigital/design-system'
import '@boriskulakhmetov-aidigital/design-system/style.css'
import { createClient } from '@supabase/supabase-js'

const APP_NAME = 'prompt-engineer'
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

interface Props {
  token: string
  theme?: string
}

export default function EmbedPage({ token, theme }: Props) {
  const [validated, setValidated] = useState<boolean | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (theme) {
      const resolved = resolveTheme({ slug: theme })
      applyTheme(resolved || aiLabsTheme)
    } else {
      applyTheme(aiLabsTheme)
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    supabase.rpc('validate_embed_token', {
      p_token: token,
      p_app: APP_NAME,
      p_origin: window.location.origin,
    }).then(({ data, error: err }) => {
      if (err || !data?.valid) {
        setError(data?.reason || err?.message || 'Invalid embed token')
        setValidated(false)
      } else {
        setValidated(true)
      }
    })
  }, [token, theme])

  if (validated === null) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading...</div>
  if (!validated) return <div style={{ padding: 40, textAlign: 'center', color: '#ef4444' }}>{error}</div>

  return (
    <EmbedLayout appTitle="Prompt Engineering Assistant" theme={theme}>
      <div style={{ padding: 20 }}>
        <p style={{ color: 'var(--text-muted)' }}>Embedded mode active. Chat interface coming soon.</p>
      </div>
    </EmbedLayout>
  )
}

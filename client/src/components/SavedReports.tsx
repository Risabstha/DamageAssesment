import { useState } from 'react'
import type { Report } from '../types/watershed'
import Button from './Button'
import InputField from './InputField'

type Props = {
  user: string | null
  reports: Report[]
  onAuthenticate: (action: 'login' | 'register', username: string, password: string) => Promise<boolean>
  onLogout: () => void
  onOpen: (id: number) => void
  onRename: (report: Report) => void
  onDelete: (id: number) => void
}

export default function SavedReports({ user, reports, onAuthenticate, onLogout, onOpen, onRename, onDelete }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  async function submit(action: 'login' | 'register') {
    if (await onAuthenticate(action, username, password)) setPassword('')
  }

  return (
    <section className="border-b border-[#dce5e8] px-6 py-[22px] print:hidden">
      <h2 className="mb-3 text-[.85rem] font-bold tracking-[.07em] uppercase">Saved reports</h2>
      {user ? (
        <>
          <p className="mt-2 mb-3 text-[.87rem] leading-[1.5]">Signed in as <strong>{user}</strong></p>
          <Button variant="secondary" size="small" onClick={onLogout}>Sign out</Button>
          {reports.length ? reports.map(report => (
            <div className="flex items-center justify-between gap-2 border-b border-[#e3ecee] py-2 text-[.8rem]" key={report.id}>
              <Button variant="link" onClick={() => onOpen(report.id)}>{report.name}<span className="mt-1 block text-[.75rem] text-[#71858b]">{report.area_km2} km² · {report.created_at}</span></Button>
              <Button variant="secondary" size="small" onClick={() => onRename(report)}>Rename</Button>
              <Button variant="secondary" size="small" onClick={() => onDelete(report.id)}>Delete</Button>
            </div>
          )) : <p className="mt-2 mb-3 text-[.87rem] leading-[1.5]">No saved reports yet.</p>}
        </>
      ) : (
        <>
          <p className="mt-2 mb-3 text-[.87rem] leading-[1.5]">Sign in to save reports. Accounts are separate from the Django portal.</p>
          <InputField placeholder="Username" autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} />
          <InputField placeholder="Password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} />
          <div className="flex items-center justify-between gap-2 [&_button]:flex-1"><Button onClick={() => void submit('login')}>Sign in</Button><Button variant="secondary" onClick={() => void submit('register')}>Create account</Button></div>
        </>
      )}
    </section>
  )
}

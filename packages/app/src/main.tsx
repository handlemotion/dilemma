import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app.tsx'
import { restoreBrowserWorkspace } from './browser-session.ts'
import './styles.css'

await restoreBrowserWorkspace()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

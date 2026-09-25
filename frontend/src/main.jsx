import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { DemoModeProvider } from './context/DemoModeContext.jsx'
import './index.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element not found')
}

createRoot(rootElement).render(
  <StrictMode>
    <DemoModeProvider>
      <App />
    </DemoModeProvider>
  </StrictMode>,
)

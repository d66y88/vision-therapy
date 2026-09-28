import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Ask the browser to keep our local data durable (mitigates eviction).
// iOS grants this implicitly when installed to the home screen.
if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
  void navigator.storage.persisted().then((already) => {
    if (!already) void navigator.storage.persist()
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

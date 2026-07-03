import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { applyTheme } from './theme/applyTheme'
import { THEME_PRESETS, DEFAULT_PRESET_ID } from './theme/presets'
import './index.css'

// Apply a default preset immediately so the app has a fully-formed theme
// (graph colors included) before any Emacs connection exists; a live theme
// push, or picking a different preset, simply overrides it afterwards --
// same pipeline either way (theme/applyTheme.ts).
applyTheme(THEME_PRESETS[DEFAULT_PRESET_ID])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

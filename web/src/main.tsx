import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './styles.css'
import './styles/themes.css'
import './styles/openings.css'
import './styles/controls.css'
import './styles/ai.css'
import './styles/polish.css'
import './styles/material.css'
import './styles/onboarding.css'
import './styles/scrollbars.css'
import './styles/extra-themes.css'
import '@fontsource/vt323/latin-400.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
)

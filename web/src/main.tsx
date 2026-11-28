import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
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
import './styles/tools.css'
import './styles/appearance.css'
import './styles/sponsor.css'
import './styles/game-worlds.css'
import './styles/handbook.css'
import './styles/page-transitions.css'
import '@fontsource/roboto/latin-400.css'
import '@fontsource/roboto/latin-500.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)

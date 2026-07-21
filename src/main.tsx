import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import './mobile.css'
import './transcript.css'
import './lyrics.css'
import './media-track.css'

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './pages/App.jsx' // Updated path to point to pages folder
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import 'antd/dist/reset.css'
import { ConfigProvider, theme, App as AntdApp } from 'antd'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ConfigProvider
        theme={{
          algorithm: theme.defaultAlgorithm,
        }}
      >
        <AntdApp>
          <App />
        </AntdApp>
      </ConfigProvider>
    </BrowserRouter>
  </StrictMode>,
)

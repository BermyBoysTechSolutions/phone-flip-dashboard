import { useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Inventory from './pages/Inventory'
import AddPhone from './pages/AddPhone'
import Sales from './pages/Sales'
import AtlasPrices from './pages/AtlasPrices'
import AtlasPhone from './pages/AtlasPhone'
import Settings from './pages/Settings'

export default function App() {
  const [chatOpen, setChatOpen] = useState(false)

  return (
    <Layout chatOpen={chatOpen} onToggleChat={() => setChatOpen(v => !v)}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/inventory/add" element={<AddPhone />} />
        <Route path="/sales" element={<Sales />} />
        <Route path="/atlas" element={<AtlasPrices />} />
        <Route path="/atlas/:slug" element={<AtlasPhone />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </Layout>
  )
}

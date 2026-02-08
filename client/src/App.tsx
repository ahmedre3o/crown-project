import React from 'react';
import Dashboard from './pages/Dashboard';
import './styles/global.css';

function App() {
  return (
    <div className="min-h-screen">
      {/* هنا مستقبلاً هنضيف الـ Sidebar */}
      <main>
        <Dashboard />
      </main>
    </div>
  );
}

export default App;
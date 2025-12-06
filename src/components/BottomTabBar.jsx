import React, { memo } from 'react';

/**
 * Mobile-only Bottom Tab Navigation
 *
 * Provides thumb-friendly navigation at the bottom of the screen for iOS/Android users.
 * Hidden on desktop (≥768px).
 *
 * Props:
 * - currentView: string ('chat', 'inventory', 'recipes', 'menu')
 * - setCurrentView: function to change current view
 * - inventoryCount: number of items in inventory
 * - recipesCount: number of custom recipes
 * - isMobile: boolean for mobile display
 */

const BottomTabBar = memo(function BottomTabBar({
  currentView,
  setCurrentView,
  inventoryCount,
  recipesCount,
  isMobile
}) {
  if (!isMobile) return null;

  const tabs = [
    { id: 'chat', icon: '💬', label: 'Chat' },
    { id: 'inventory', icon: '📦', label: `Inventory` },
    { id: 'recipes', icon: '⭐', label: `Favorites` },
    { id: 'menu', icon: '📋', label: 'Menu' }
  ];

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      height: '64px',
      paddingBottom: 'env(safe-area-inset-bottom)',
      background: 'white',
      borderTop: '1px solid #e5e7eb',
      display: 'flex',
      justifyContent: 'space-around',
      zIndex: 999,
      boxShadow: '0 -2px 10px rgba(0,0,0,0.05)'
    }}>
      {tabs.map(tab => {
        const isActive = currentView === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setCurrentView(tab.id)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              background: isActive ? '#f3f4f6' : 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: '500',
              minHeight: '48px',
              color: isActive ? '#667eea' : '#6b7280',
              transition: 'all 0.2s ease',
              padding: '0'
            }}
            title={tab.label}
          >
            <span style={{ fontSize: '20px', lineHeight: '1' }}>{tab.icon}</span>
            <span style={{
              fontSize: '10px',
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {tab.id === 'inventory' ? `📦 (${inventoryCount})` :
               tab.id === 'recipes' ? `⭐ (${recipesCount})` :
               tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
});

export default BottomTabBar;

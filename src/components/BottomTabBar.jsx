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
  isMobile,
  bottomOffset = 0
}) {
  if (!isMobile) return null;

  const tabs = [
    { id: 'chat', icon: '💬', label: 'Chat' },
    { id: 'inventory', icon: '📦', label: `Inventory` },
    { id: 'recipes', icon: '⭐', label: `Favorites` },
    { id: 'menu', icon: '📋', label: 'Menu' }
  ];

  return (
    <nav aria-label="Main" style={{
      position: 'fixed',
      bottom: bottomOffset,
      left: 0,
      right: 0,
      height: '64px',
      paddingBottom: 'env(safe-area-inset-bottom)',
      background: 'white',
      borderTop: '1px solid #e5e7eb',
      display: 'flex',
      justifyContent: 'space-around',
      boxSizing: 'content-box',
      zIndex: 999,
      boxShadow: '0 -2px 10px rgba(0,0,0,0.05)'
    }}>
      {tabs.map(tab => {
        const isActive = currentView === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setCurrentView(tab.id)}
            aria-label={tab.id === 'inventory' ? `Inventory, ${inventoryCount} items` : tab.id === 'recipes' ? `Favorites, ${recipesCount} recipes` : tab.label}
            aria-current={isActive ? 'page' : undefined}
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
              color: isActive ? '#4338ca' : '#4b5563',
              transition: 'all 0.2s ease',
              padding: '0'
            }}
            title={tab.label}
          >
            <span aria-hidden="true" style={{ fontSize: '20px', lineHeight: '1' }}>{tab.icon}</span>
            <span aria-hidden="true" style={{
              fontSize: '11px',
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}>
              {tab.id === 'inventory' ? `Inventory (${inventoryCount})` :
               tab.id === 'recipes' ? `Favorites (${recipesCount})` :
               tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
});

export default BottomTabBar;

import { useEffect, useState } from 'react';

export default function OnlineStatusIndicator() {
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [showOffline, setShowOffline] = useState(false);
  const [showBackOnline, setShowBackOnline] = useState(false);

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      setShowOffline(false);
      setShowBackOnline(true);
      setTimeout(() => setShowBackOnline(false), 2500);
    };
    const goOffline = () => {
      setOnline(false);
      setShowOffline(true);
    };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    if (!navigator.onLine) setShowOffline(true);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (!showOffline && !showBackOnline) return null;

  const isOffline = !online;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top, 0px) + 8px)',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 99999,
        background: isOffline ? '#1f2937' : '#059669',
        color: '#fff',
        padding: '6px 14px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
        pointerEvents: 'none',
        letterSpacing: 0.2,
      }}
    >
      {isOffline ? '● Offline — changes saved locally' : '● Back online'}
    </div>
  );
}

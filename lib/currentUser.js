'use client';
import { useState, useEffect } from 'react';

export function useCurrentUser() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/app-auth/me')
      .then(r => r.json())
      .then(d => { setUser(d.user || null); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return { user, loading };
}
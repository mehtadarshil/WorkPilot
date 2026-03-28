'use client';

import { useEffect } from 'react';

export default function GoogleCallback() {
  useEffect(() => {
    console.log('Google callback hit. URL:', window.location.href);
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const error = params.get('error');

    if (error) {
      console.error('Google OAuth error:', error);
      document.body.innerHTML = `<div style="padding:20px;text-align:center;color:red;"><h1>Auth Error</h1><p>${error}</p></div>`;
      return;
    }

    if (!code) {
      console.error('No code found in URL');
      return;
    }

    if (!window.opener) {
      console.error('Window opener is missing! Communication between windows failed.');
      document.body.innerHTML = '<div style="padding:20px;text-align:center;color:orange;"><h1>Window Opener Missing</h1><p>Please try closing this and connecting again.</p></div>';
      return;
    }

    console.log('Sending message to opener via BroadcastChannel...');
    const channel = new BroadcastChannel('google_auth');
    channel.postMessage({ type: 'GOOGLE_AUTH_CODE', code });
    
    // Give channel some time to broadcast before closing window
    setTimeout(() => {
      channel.close();
      window.close();
    }, 1000);
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-white p-6">
      <div className="text-center">
        <h1 className="mb-2 text-xl font-bold text-slate-900">Authenticating...</h1>
        <p className="text-sm text-slate-500">Please wait while we complete the connection with Google.</p>
        <div className="mt-4 flex justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#14B8A6] border-t-transparent shadow-sm"></div>
        </div>
      </div>
    </div>
  );
}

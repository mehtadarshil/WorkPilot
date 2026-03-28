'use client';

import { useEffect } from 'react';

export default function MicrosoftCallback() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      const channel = new BroadcastChannel('ms_auth');
      channel.postMessage({ type: 'MS_AUTH_CODE', code });
      setTimeout(() => {
        channel.close();
        window.close();
      }, 1000);
    }
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-white p-6">
      <div className="text-center">
        <h1 className="mb-2 text-xl font-bold text-slate-900">Authenticating...</h1>
        <p className="text-sm text-slate-500">Please wait while we complete the connection with Microsoft.</p>
        <div className="mt-4 flex justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#14B8A6] border-t-transparent shadow-sm"></div>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useNostr } from '@/lib/nostr/NostrContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function HomeClient() {
  const { login, user, isLoading } = useNostr();
  const router = useRouter();

  useEffect(() => {
    if (user) {
      router.push('/dashboard');
    }
  }, [user, router]);

  const handleLogin = async () => {
    try {
      await login();
    } catch (error) {
      console.error('Login failed:', error);
      alert('Please make sure you have a nostr extension (like nos2x) installed and enabled.');
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="text-center space-y-6 max-w-2xl mx-auto">
        <h1 className="text-5xl font-bold bg-gradient-to-r from-rose-600 to-custom-green-500 bg-clip-text text-transparent">
          YouCupid
        </h1>
        <p className="text-xl text-gray-600">
          A decentralized dating app powered by nostr
        </p>
        <div className="space-y-4">
          <button
            onClick={handleLogin}
            disabled={isLoading}
            className="px-6 py-3 bg-gradient-to-r from-rose-500 to-custom-green-500 text-white rounded-lg font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isLoading ? 'Connecting...' : 'Login with Nostr'}
          </button>
          <p className="text-sm text-gray-500">
            You need a nostr extension (like nos2x) to use this app
          </p>
        </div>
      </div>
    </div>
  );
} 
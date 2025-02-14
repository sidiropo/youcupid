'use client';

import { useNostr } from '@/lib/nostr/NostrContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function HomeClient() {
  const { login, user, isLoading } = useNostr();
  const router = useRouter();
  const [hasNostrExtension, setHasNostrExtension] = useState<boolean | null>(null);

  useEffect(() => {
    // Check if nostr extension is available
    setHasNostrExtension(!!window.nostr);
  }, []);

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
        <h1 className="text-5xl font-bold bg-gradient-to-r from-[#B71C5D] to-custom-green-500 bg-clip-text text-transparent">
          YouCupid
        </h1>
        <p className="text-xl text-gray-600">
          A decentralized dating app powered by nostr
        </p>
        <div className="space-y-4">
          {hasNostrExtension === false ? (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-red-600 font-medium mb-2">Nostr Extension Not Found</p>
              <p className="text-sm text-gray-600 mb-4">
                To use YouCupid, you need to install a Nostr extension first.
              </p>
              <a 
                href="https://chrome.google.com/webstore/detail/nos2x/kpgefcfmnafjgpblomihpgmejjdanjjp"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Install nos2x Extension
              </a>
            </div>
          ) : (
            <button
              onClick={handleLogin}
              disabled={isLoading}
              className="px-6 py-3 bg-gradient-to-r from-[#B71C5D] to-custom-green-500 text-white rounded-lg font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {isLoading ? 'Connecting...' : 'Login with Nostr'}
            </button>
          )}
          <p className="text-sm text-gray-500">
            You need a nostr extension (like{' '}
            <a 
              href="https://chrome.google.com/webstore/detail/nos2x/kpgefcfmnafjgpblomihpgmejjdanjjp"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#B71C5D] hover:underline"
            >
              nos2x
            </a>
            ) to use this app
          </p>
        </div>
      </div>
    </div>
  );
} 
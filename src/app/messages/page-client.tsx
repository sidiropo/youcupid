'use client';

import { useSearchParams } from 'next/navigation';
import MessagesClient from './MessagesClient';

export default function MessagesPageClient() {
  const searchParams = useSearchParams();
  const pubkey = searchParams.get('pubkey');

  if (!pubkey) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-2xl text-gray-600">Invalid user</div>
      </div>
    );
  }

  return <MessagesClient />;
} 
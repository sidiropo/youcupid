'use client';

import MessagesClient from './MessagesClient';
import { useSearchParams } from 'next/navigation';

export default function MessagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const searchParams = useSearchParams();
  const pubkey = searchParams.get('pubkey');

  if (!pubkey) {
    return children;
  }

  return <MessagesClient />;
} 
'use client';

import { useNostr } from '@/lib/nostr/NostrContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { NDKUser } from '@nostr-dev-kit/ndk';

export default function MatchPageClient() {
  const { user, getFriends, createMatch } = useNostr();
  const router = useRouter();
  const [friends, setFriends] = useState<NDKUser[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      router.push('/');
      return;
    }

    const loadFriends = async () => {
      try {
        const friendsList = await getFriends();
        setFriends(friendsList);
      } catch (error) {
        console.error('Error loading friends:', error);
      } finally {
        setLoading(false);
      }
    };

    loadFriends();
  }, [user, getFriends, router]);

  const handleFriendSelect = (pubkey: string) => {
    setSelectedFriends(prev => {
      if (prev.includes(pubkey)) {
        return prev.filter(key => key !== pubkey);
      }
      if (prev.length < 2) {
        return [...prev, pubkey];
      }
      return prev;
    });
  };

  const handleCreateMatch = async () => {
    if (selectedFriends.length !== 2) return;

    try {
      await createMatch(selectedFriends[0], selectedFriends[1]);
      alert('Match created successfully!');
      setSelectedFriends([]);
    } catch (error) {
      console.error('Error creating match:', error);
      alert('Failed to create match. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-2xl text-gray-600">Loading friends...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-800">Create a Match</h1>
          <button
            onClick={() => router.push('/dashboard')}
            className="text-gray-600 hover:text-gray-800"
          >
            Back to Dashboard
          </button>
        </header>

        {/* Instructions */}
        <div className="bg-white rounded-lg p-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-2">How it works</h2>
          <p className="text-gray-600">
            Select two friends from your contacts list to create a potential match.
            Both friends will be notified about the match.
          </p>
        </div>

        {/* Friend Selection */}
        <div className="bg-white rounded-lg p-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-4">Select Two Friends</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {friends.map((friend) => (
              <div
                key={friend.pubkey}
                onClick={() => handleFriendSelect(friend.pubkey)}
                className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                  selectedFriends.includes(friend.pubkey)
                    ? 'border-lime-500 bg-lime-50'
                    : 'hover:border-gray-300'
                }`}
              >
                <h3 className="font-semibold">
                  {friend.profile?.name || 'Anonymous'}
                </h3>
                <p className="text-sm text-gray-500 truncate">{friend.pubkey}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Create Match Button */}
        <div className="flex justify-center">
          <button
            onClick={handleCreateMatch}
            disabled={selectedFriends.length !== 2}
            className="px-8 py-3 bg-lime-500 text-white rounded-lg font-semibold hover:bg-lime-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {selectedFriends.length === 2
              ? 'Create Match'
              : `Select ${2 - selectedFriends.length} more friend${
                  selectedFriends.length === 1 ? '' : 's'
                }`}
          </button>
        </div>
      </div>
    </div>
  );
} 
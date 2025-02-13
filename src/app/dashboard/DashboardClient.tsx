'use client';

import { useNostr } from '@/lib/nostr/NostrContext';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useEffect, useState } from 'react';

interface SimplifiedNDKUser {
  pubkey: string;
  profile?: {
    name?: string;
    picture?: string;
  };
}

interface SimplifiedNDKEvent {
  id: string;
  content: string;
  created_at?: number;
  pubkey: string;
  tags: string[][];
}

export default function DashboardClient() {
  const { user, publicKey, relays, addRelay, removeRelay, getFriends, getMatches, getMatchesInvolvingMe, logout, createMatch } = useNostr();
  const router = useRouter();
  const [friends, setFriends] = useState<SimplifiedNDKUser[]>([]);
  const [matches, setMatches] = useState<SimplifiedNDKEvent[]>([]);
  const [matchesInvolvingMe, setMatchesInvolvingMe] = useState<SimplifiedNDKEvent[]>([]);
  const [newRelay, setNewRelay] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState('profile');
  const [isCreatingMatch, setIsCreatingMatch] = useState(false);

  useEffect(() => {
    if (!user) {
      router.push('/');
      return;
    }

    const loadData = async () => {
      try {
        // Load each piece of data independently to avoid Promise.all failing everything
        let friendsData: SimplifiedNDKUser[] = [];
        let matchesData: SimplifiedNDKEvent[] = [];
        let matchesInvolvingMeData: SimplifiedNDKEvent[] = [];

        try {
          friendsData = await getFriends() as SimplifiedNDKUser[];
        } catch (error) {
          console.error('Error loading friends:', error);
        }

        try {
          const rawMatchesData = await getMatches();
          matchesData = rawMatchesData.map(match => ({
            id: match.id,
            content: match.content,
            created_at: match.created_at || Math.floor(Date.now() / 1000),
            pubkey: match.pubkey,
            tags: match.tags
          }));
        } catch (error) {
          console.error('Error loading matches:', error);
        }

        try {
          const rawMatchesInvolvingMeData = await getMatchesInvolvingMe();
          matchesInvolvingMeData = rawMatchesInvolvingMeData.map(match => ({
            id: match.id,
            content: match.content,
            created_at: match.created_at || Math.floor(Date.now() / 1000),
            pubkey: match.pubkey,
            tags: match.tags
          }));
        } catch (error) {
          console.error('Error loading matches involving me:', error);
        }

        setFriends(friendsData);
        setMatches(matchesData);
        setMatchesInvolvingMe(matchesInvolvingMeData);
      } catch (error) {
        console.error('Error in loadData:', error);
      } finally {
        // Ensure loading is set to false even if there are errors
        setLoading(false);
      }
    };

    loadData();
  }, [user, router, getFriends, getMatches, getMatchesInvolvingMe]);

  const handleAddRelay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newRelay) {
      await addRelay(newRelay);
      setNewRelay('');
    }
  };

  const handleLogout = () => {
    logout();
    router.push('/');
  };

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
    if (selectedFriends.length !== 2 || isCreatingMatch) return;

    setIsCreatingMatch(true);
    try {
      await createMatch(selectedFriends[0], selectedFriends[1]);
      // Refresh matches after creating a new one
      const matchesData = await getMatches();
      setMatches(matchesData);
      setSelectedFriends([]); // Clear selection after successful match
      alert('Match created successfully!');
    } catch (error) {
      console.error('Error creating match:', error);
      alert('Failed to create match. Please try again.');
    } finally {
      setIsCreatingMatch(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-2xl text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Image
              src="/youcupid.png"
              alt="YouCupid Logo"
              width={70}
              height={70}
              className="object-contain"
            />
            <h1 className="text-3xl font-bold text-gray-800">YouCupid</h1>
          </div>
          <div className="space-x-4">
            <button
              onClick={() => router.push('/match')}
              className="px-4 py-2 bg-custom-green-500 text-white rounded-lg hover:bg-custom-green-600"
            >
              Create Match
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-rose-500 text-white rounded-lg hover:bg-rose-600"
            >
              Logout
            </button>
          </div>
        </header>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="border-b">
            <nav className="flex">
              <button
                onClick={() => setActiveTab('profile')}
                className={`px-6 py-3 text-sm font-medium ${
                  activeTab === 'profile'
                    ? 'border-b-2 border-custom-green-500 text-custom-green-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Your Profile
              </button>
              <button
                onClick={() => setActiveTab('relays')}
                className={`px-6 py-3 text-sm font-medium ${
                  activeTab === 'relays'
                    ? 'border-b-2 border-custom-green-500 text-custom-green-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Manage Relays
              </button>
              <button
                onClick={() => setActiveTab('matches')}
                className={`px-6 py-3 text-sm font-medium ${
                  activeTab === 'matches'
                    ? 'border-b-2 border-custom-green-500 text-custom-green-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Matches
              </button>
              <button
                onClick={() => setActiveTab('created-matches')}
                className={`px-6 py-3 text-sm font-medium ${
                  activeTab === 'created-matches'
                    ? 'border-b-2 border-custom-green-500 text-custom-green-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Your Created Matches
              </button>
              <button
                onClick={() => setActiveTab('friends')}
                className={`px-6 py-3 text-sm font-medium ${
                  activeTab === 'friends'
                    ? 'border-b-2 border-custom-green-500 text-custom-green-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Your Friends
              </button>
            </nav>
          </div>

          <div className="p-6">
            {/* Profile Tab */}
            {activeTab === 'profile' && (
              <div>
                <h2 className="text-xl font-semibold mb-4">Your Profile</h2>
                <p className="text-gray-600">Public Key: {publicKey}</p>
                <p className="text-gray-600">Name: {user?.profile?.name || 'Not set'}</p>
              </div>
            )}

            {/* Relays Tab */}
            {activeTab === 'relays' && (
              <div>
                <h2 className="text-xl font-semibold mb-4">Manage Relays</h2>
                <form onSubmit={handleAddRelay} className="flex gap-2 mb-4">
                  <input
                    type="text"
                    value={newRelay}
                    onChange={(e) => setNewRelay(e.target.value)}
                    placeholder="wss://relay.example.com"
                    className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-custom-green-500"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-custom-green-500 text-white rounded-lg hover:bg-custom-green-600"
                  >
                    Add Relay
                  </button>
                </form>
                <ul className="space-y-2">
                  {relays.map((relay) => (
                    <li key={relay} className="flex justify-between items-center bg-gray-50 p-3 rounded-lg">
                      <span>{relay}</span>
                      <button
                        onClick={() => removeRelay(relay)}
                        className="text-rose-500 hover:text-rose-600"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Matches Tab */}
            {activeTab === 'matches' && (
              <div>
                <h2 className="text-xl font-semibold mb-4">Matches</h2>
                <div className="space-y-4">
                  {matchesInvolvingMe.map((match) => (
                    <div key={match.id} className="p-4 border rounded-lg">
                      <div className="flex items-center gap-4">
                        {match.tags
                          .filter(tag => tag[0] === 'p')
                          .map((tag, index) => (
                            <div key={tag[1]} className="flex items-center gap-2">
                              <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0">
                                <img
                                  src={tag[3] || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y'}
                                  alt={tag[2] || 'Anonymous'}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <div>
                                <p className="font-medium">{tag[2] || tag[1].slice(0, 8)}</p>
                                {index === 0 && <span className="text-gray-500">matched with</span>}
                              </div>
                            </div>
                          ))}
                      </div>
                      <p className="text-sm text-gray-500 mt-2">
                        Created: {new Date(match.created_at! * 1000).toLocaleString()}
                      </p>
                    </div>
                  ))}
                  {matchesInvolvingMe.length === 0 && (
                    <p className="text-gray-500 text-center py-4">
                      No matches involving you yet. Ask your friends to match you with someone!
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Created Matches Tab */}
            {activeTab === 'created-matches' && (
              <div>
                <h2 className="text-xl font-semibold mb-4">Your Created Matches</h2>
                <div className="space-y-4">
                  {matches.map((match) => (
                    <div key={match.id} className="p-4 border rounded-lg">
                      <div className="flex items-center gap-4">
                        {match.tags
                          .filter(tag => tag[0] === 'p')
                          .map((tag, index) => (
                            <div key={tag[1]} className="flex items-center gap-2">
                              <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0">
                                <img
                                  src={tag[3] || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y'}
                                  alt={tag[2] || 'Anonymous'}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <div>
                                <p className="font-medium">{tag[2] || tag[1].slice(0, 8)}</p>
                                {index === 0 && <span className="text-gray-500">matched with</span>}
                              </div>
                            </div>
                          ))}
                      </div>
                      <p className="text-sm text-gray-500 mt-2">
                        Created: {new Date(match.created_at! * 1000).toLocaleString()}
                      </p>
                    </div>
                  ))}
                  {matches.length === 0 && (
                    <p className="text-gray-500 text-center py-4">
                      You haven&apos;t created any matches yet. Go to the Create Match page to match your friends!
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Friends Tab */}
            {activeTab === 'friends' && (
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-semibold">Your Friends</h2>
                  {selectedFriends.length === 2 && (
                    <button
                      onClick={handleCreateMatch}
                      disabled={isCreatingMatch}
                      className={`px-4 py-2 bg-custom-green-500 text-white rounded-lg ${
                        isCreatingMatch ? 'opacity-50 cursor-not-allowed' : 'hover:bg-custom-green-600'
                      } flex items-center gap-2`}
                    >
                      {isCreatingMatch ? (
                        <>
                          <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Creating Match...
                        </>
                      ) : (
                        'Match Selected Friends'
                      )}
                    </button>
                  )}
                </div>
                <div className="space-y-3">
                  {friends.map((friend) => (
                    <div
                      key={friend.pubkey}
                      className={`p-4 border rounded-lg transition-colors flex justify-between items-center ${
                        selectedFriends.includes(friend.pubkey) ? 'border-custom-green-500 bg-custom-green-50' : 'hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center flex-grow">
                        <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 mr-4">
                          <img
                            src={friend.profile?.picture || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y'}
                            alt={friend.profile?.name || 'Anonymous'}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div>
                          <h3 className="font-semibold">{friend.profile?.name || 'Anonymous'}</h3>
                          <p className="text-sm text-gray-500 truncate">{friend.pubkey}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => router.push(`/messages?pubkey=${friend.pubkey}`)}
                          className="px-4 py-2 bg-custom-green-500 text-white rounded-lg hover:bg-custom-green-600"
                        >
                          Chat
                        </button>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            handleFriendSelect(friend.pubkey);
                          }}
                          className={`px-4 py-2 rounded-lg border ${
                            selectedFriends.includes(friend.pubkey)
                              ? 'bg-rose-500 text-white hover:bg-rose-600 border-transparent'
                              : 'border-custom-green-500 text-custom-green-500 hover:bg-custom-green-50'
                          }`}
                        >
                          {selectedFriends.includes(friend.pubkey) ? 'Unselect' : 'Match'}
                        </button>
                      </div>
                    </div>
                  ))}
                  {friends.length === 0 && (
                    <p className="text-gray-500 text-center py-4">
                      No friends found. Add some friends to get started!
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 
'use client';

import { useNostr } from '@/lib/nostr/NostrContext';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { NDKEvent } from '@nostr-dev-kit/ndk';
import defaultAvatar from '@/assets/default-avatar.png';

interface SimplifiedNDKEvent {
  id: string;
  content: string;
  created_at: number;
  pubkey: string;
  tags: string[][];
}

interface SimplifiedNDKUser {
  pubkey: string;
  profile?: {
    name?: string;
    picture?: string;
  };
}

interface ActiveChat {
  pubkey: string;
  lastMessage: {
    content: string;
    created_at: number;
  };
  profile: {
    name: string;
    picture: string;
  };
}

interface NDKEventWithTags extends NDKEvent {
  tags: string[][];
}

export default function DashboardClient() {
  const { user, publicKey, relays, ndk, addRelay, removeRelay, getFriends, getMatches, getMatchesInvolvingMe, logout, createMatch, updateProfile, addFriend } = useNostr();
  const router = useRouter();
  const [friends, setFriends] = useState<SimplifiedNDKUser[]>([]);
  const [matches, setMatches] = useState<SimplifiedNDKEvent[]>([]);
  const [matchesInvolvingMe, setMatchesInvolvingMe] = useState<SimplifiedNDKEvent[]>([]);
  const [activeChats, setActiveChats] = useState<ActiveChat[]>([]);
  const [newRelay, setNewRelay] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState('profile');
  const [isCreatingMatch, setIsCreatingMatch] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isAddingFriend, setIsAddingFriend] = useState(false);
  const [newFriendPubkey, setNewFriendPubkey] = useState('');
  const [addFriendError, setAddFriendError] = useState('');
  const [isAddingFriendLoading, setIsAddingFriendLoading] = useState(false);
  const [profileForm, setProfileForm] = useState<{
    name: string;
    about: string;
    picture: string;
  }>({
    name: user?.profile?.name || '',
    about: '',
    picture: typeof user?.profile?.picture === 'string' ? user.profile.picture : '',
  });
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);

  // Update profileForm when user changes
  useEffect(() => {
    if (user?.profile) {
      setProfileForm({
        name: user.profile.name || '',
        about: (user.profile.about as string) || '',
        picture: typeof user.profile.picture === 'string' ? user.profile.picture : '',
      });
    }
  }, [user]);

  useEffect(() => {
    if (!user || !ndk || !publicKey) {
      return;
    }

    // Load active chats
    const loadActiveChats = async () => {
      try {
        // First get messages we sent
        const sentFilter = {
          kinds: [4], // kind 4 is for encrypted direct messages
          authors: [publicKey],
          limit: 100,
        };

        // Also get messages sent to us
        const receivedFilter = {
          kinds: [4],
          '#p': [publicKey], // messages where we are the recipient
          limit: 100,
        };

        const [sentEvents, receivedEvents] = await Promise.all([
          ndk.fetchEvents(sentFilter),
          ndk.fetchEvents(receivedFilter)
        ]);

        const chatMap = new Map<string, { content: string; created_at: number }>();
        
        // Process sent messages
        for (const event of Array.from(sentEvents)) {
          const ndkEvent = event as NDKEventWithTags;
          const recipient = ndkEvent.tags.find((tag: string[]) => tag[0] === 'p')?.[1];
          if (!recipient) continue;

          const existing = chatMap.get(recipient);
          if (!existing || existing.created_at < ndkEvent.created_at!) {
            try {
              const nostr = window.nostr;
              if (!nostr?.nip04) {
                throw new Error('NIP-04 encryption not supported by extension');
              }
              // Use the recipient's pubkey for decryption since we're the sender
              const decryptionPubkey = recipient;
              const decryptedContent = await nostr.nip04.decrypt(decryptionPubkey, ndkEvent.content);
              chatMap.set(recipient, {
                content: decryptedContent,
                created_at: ndkEvent.created_at!
              });
            } catch (error) {
              console.error('Error decrypting sent message:', error);
              chatMap.set(recipient, {
                content: '(Unable to decrypt message)',
                created_at: ndkEvent.created_at!
              });
            }
          }
        }

        // Process received messages
        for (const event of Array.from(receivedEvents)) {
          const ndkEvent = event as NDKEventWithTags;
          const sender = ndkEvent.pubkey;
          if (!sender) continue;

          const existing = chatMap.get(sender);
          if (!existing || existing.created_at < ndkEvent.created_at!) {
            try {
              const nostr = window.nostr;
              if (!nostr?.nip04) {
                throw new Error('NIP-04 encryption not supported by extension');
              }
              // Use the sender's pubkey for decryption since they sent it
              const decryptionPubkey = sender;
              const decryptedContent = await nostr.nip04.decrypt(decryptionPubkey, ndkEvent.content);
              chatMap.set(sender, {
                content: decryptedContent,
                created_at: ndkEvent.created_at!
              });
            } catch (error) {
              console.error('Error decrypting received message:', error);
              chatMap.set(sender, {
                content: '(Unable to decrypt message)',
                created_at: ndkEvent.created_at!
              });
            }
          }
        }

        // Convert to array and add profile information
        const defaultAvatar = 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y';

        // Convert to array and add profile information
        const chats: ActiveChat[] = await Promise.all(
          Array.from(chatMap.entries()).map(async ([pubkey, lastMessage]) => {
            try {
              const chatPartnerUser = ndk.getUser({ pubkey });
              const profile = await chatPartnerUser.fetchProfile();
              const profilePicture = typeof profile?.picture === 'string' ? profile.picture : defaultAvatar;
              
              return {
                pubkey,
                lastMessage,
                profile: {
                  name: profile?.name || pubkey.slice(0, 8),
                  picture: profilePicture
                }
              };
            } catch (error) {
              console.error('Error fetching profile for user:', pubkey, error);
              return {
                pubkey,
                lastMessage,
                profile: {
                  name: pubkey.slice(0, 8),
                  picture: defaultAvatar
                }
              };
            }
          })
        );

        // Sort by most recent message
        chats.sort((a, b) => b.lastMessage.created_at - a.lastMessage.created_at);
        setActiveChats(chats);
      } catch (error) {
        console.error('Error loading active chats:', error);
      }
    };

    loadActiveChats();
  }, [ndk, user, publicKey]);

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
          matchesData = Array.from(rawMatchesData).map(match => ({
            id: match.id || '',
            content: match.content || '',
            created_at: Math.floor(match.created_at || Date.now() / 1000),
            pubkey: match.pubkey || '',
            tags: match.tags.map(tag => tag.map(item => String(item)))
          }));
        } catch (error) {
          console.error('Error loading matches:', error);
        }

        try {
          const rawMatchesInvolvingMeData = await getMatchesInvolvingMe();
          matchesInvolvingMeData = Array.from(rawMatchesInvolvingMeData).map(match => ({
            id: match.id || '',
            content: match.content || '',
            created_at: Math.floor(match.created_at || Date.now() / 1000),
            pubkey: match.pubkey || '',
            tags: match.tags.map(tag => tag.map(item => String(item)))
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
      // Transform NDKEvent[] to SimplifiedNDKEvent[]
      const simplifiedMatches = Array.from(matchesData).map(event => ({
        id: event.id || '',
        content: event.content || '',
        created_at: Math.floor(event.created_at || Date.now() / 1000),
        pubkey: event.pubkey || '',
        tags: event.tags.map(tag => tag.map(item => String(item)))
      }));
      setMatches(simplifiedMatches);
      setSelectedFriends([]); // Clear selection after successful match
      alert('Match created successfully!');
    } catch (error) {
      console.error('Error creating match:', error);
      alert('Failed to create match. Please try again.');
    } finally {
      setIsCreatingMatch(false);
    }
  };

  const handleAddFriend = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddFriendError('');
    setIsAddingFriendLoading(true);
    
    try {
      await addFriend(newFriendPubkey);
      // Refresh friends list
      const friendsData = await getFriends();
      setFriends(friendsData);
      // Reset form
      setNewFriendPubkey('');
      setIsAddingFriend(false);
    } catch (error) {
      setAddFriendError(error instanceof Error ? error.message : 'Failed to add friend');
    } finally {
      setIsAddingFriendLoading(false);
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
              src={process.env.NODE_ENV === 'production' ? '/youcupid/youcupid.png' : '/youcupid.png'}
              alt="YouCupid Logo"
              width={70}
              height={70}
              className="object-contain"
              priority
            />
            <h1 className="text-3xl font-bold text-[#B71C5D]">YouCupid</h1>
          </div>
          <div className="space-x-4">
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-[#B71C5D] text-white rounded-lg hover:bg-[#9D1850]"
            >
              Logout
            </button>
          </div>
        </header>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="border-b">
            <nav className="flex overflow-x-auto whitespace-nowrap hide-scrollbar">
              <button
                onClick={() => setActiveTab('profile')}
                className={`px-4 sm:px-6 py-3 text-sm font-medium ${
                  activeTab === 'profile'
                    ? 'border-b-2 border-custom-green-500 text-custom-green-600'
                    : 'text-gray-700 hover:text-gray-900'
                }`}
              >
                Your Profile
              </button>
              <button
                onClick={() => setActiveTab('matches')}
                className={`px-4 sm:px-6 py-3 text-sm font-medium ${
                  activeTab === 'matches'
                    ? 'border-b-2 border-custom-green-500 text-custom-green-600'
                    : 'text-gray-700 hover:text-gray-900'
                }`}
              >
                Matches
              </button>
              <button
                onClick={() => setActiveTab('chats')}
                className={`px-4 sm:px-6 py-3 text-sm font-medium ${
                  activeTab === 'chats'
                    ? 'border-b-2 border-custom-green-500 text-custom-green-600'
                    : 'text-gray-700 hover:text-gray-900'
                }`}
              >
                Chats
              </button>
              <button
                onClick={() => setActiveTab('created-matches')}
                className={`px-4 sm:px-6 py-3 text-sm font-medium ${
                  activeTab === 'created-matches'
                    ? 'border-b-2 border-custom-green-500 text-custom-green-600'
                    : 'text-gray-700 hover:text-gray-900'
                }`}
              >
                Your Created Matches
              </button>
              <button
                onClick={() => setActiveTab('friends')}
                className={`px-4 sm:px-6 py-3 text-sm font-medium ${
                  activeTab === 'friends'
                    ? 'border-b-2 border-custom-green-500 text-custom-green-600'
                    : 'text-gray-700 hover:text-gray-900'
                }`}
              >
                Your Friends
              </button>
              <button
                onClick={() => setActiveTab('relays')}
                className={`px-4 sm:px-6 py-3 text-sm font-medium ${
                  activeTab === 'relays'
                    ? 'border-b-2 border-custom-green-500 text-custom-green-600'
                    : 'text-gray-700 hover:text-gray-900'
                }`}
              >
                Manage Relays
              </button>
            </nav>
          </div>

          <div className="p-3 sm:p-6">
            {/* Profile Tab */}
            {activeTab === 'profile' && (
              <div className="max-w-2xl mx-auto">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-semibold text-gray-900">Your Profile</h2>
                  <button
                    onClick={() => setIsEditingProfile(!isEditingProfile)}
                    className="px-4 py-2 text-sm bg-custom-green-500 text-white rounded-lg hover:bg-custom-green-600"
                  >
                    {isEditingProfile ? 'Cancel' : 'Edit Profile'}
                  </button>
                </div>

                {isEditingProfile ? (
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      setIsUpdatingProfile(true);
                      await updateProfile(profileForm);
                      setIsEditingProfile(false);
                    } catch (error) {
                      console.error('Failed to update profile:', error);
                      alert('Failed to update profile. Please try again.');
                    } finally {
                      setIsUpdatingProfile(false);
                    }
                  }} className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-900 mb-1">
                        Profile Picture
                      </label>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onloadend = () => {
                                  setProfileForm({ ...profileForm, picture: reader.result as string });
                                };
                                reader.readAsDataURL(file);
                              }
                            }}
                            className="text-sm text-gray-900 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-custom-green-50 file:text-custom-green-700 hover:file:bg-custom-green-100"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-600">or enter an image URL:</span>
                          <input
                            type="url"
                            value={profileForm.picture}
                            onChange={(e) => setProfileForm({ ...profileForm, picture: e.target.value })}
                            placeholder="https://example.com/your-photo.jpg"
                            className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-custom-green-500 text-gray-900 placeholder-gray-500"
                          />
                        </div>
                        {profileForm.picture && (
                          <div className="mt-2">
                            <img
                              src={profileForm.picture}
                              alt="Profile Preview"
                              className="w-32 h-32 object-cover rounded-lg"
                              onError={(e) => {
                                e.currentTarget.src = 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y';
                              }}
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-900 mb-1">
                        Name
                      </label>
                      <input
                        type="text"
                        value={profileForm.name}
                        onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                        placeholder="Your name"
                        className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-custom-green-500 text-gray-900 placeholder-gray-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-900 mb-1">
                        About
                      </label>
                      <textarea
                        value={profileForm.about}
                        onChange={(e) => setProfileForm({ ...profileForm, about: e.target.value })}
                        placeholder="Tell us about yourself..."
                        rows={4}
                        className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-custom-green-500 text-gray-900 placeholder-gray-500"
                      />
                    </div>

                    <div className="flex justify-end gap-4">
                      <button
                        type="button"
                        onClick={() => setIsEditingProfile(false)}
                        className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isUpdatingProfile}
                        className={`px-4 py-2 text-sm bg-custom-green-500 text-white rounded-lg hover:bg-custom-green-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2`}
                      >
                        {isUpdatingProfile ? (
                          <>
                            <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Saving...
                          </>
                        ) : (
                          'Save Changes'
                        )}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-6">
                    <div className="flex items-start gap-6">
                      <img
                        src={typeof user?.profile?.picture === 'string' ? user.profile.picture : 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y'}
                        alt={user?.profile?.name || 'Profile'}
                        className="w-32 h-32 object-cover rounded-lg"
                        onError={(e) => {
                          e.currentTarget.src = 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y';
                        }}
                      />
                      <div>
                        <h3 className="text-lg font-medium text-gray-900">{user?.profile?.name || 'Anonymous'}</h3>
                        <p className="text-sm text-gray-600 break-all mt-1">{publicKey}</p>
                        {profileForm.about && (
                          <p className="text-gray-700 mt-4">{profileForm.about}</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Matches Tab */}
            {activeTab === 'matches' && (
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Matches</h2>
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
                                <p className="font-medium text-gray-900">{tag[2] || tag[1].slice(0, 8)}</p>
                                {index === 0 && <span className="text-gray-700">matched with</span>}
                              </div>
                            </div>
                          ))}
                      </div>
                      <div className="flex justify-between items-center mt-4">
                        <p className="text-sm text-gray-700">
                          Created: {new Date(match.created_at * 1000).toLocaleString()}
                        </p>
                        <button
                          onClick={() => {
                            // Find the other person in the match (not the current user)
                            const otherPerson = match.tags
                              .filter(tag => tag[0] === 'p')
                              .find(tag => tag[1] !== publicKey);
                            if (otherPerson) {
                              router.push(`/messages?pubkey=${otherPerson[1]}`);
                            }
                          }}
                          className="px-4 py-2 bg-custom-green-500 text-white rounded-lg hover:bg-custom-green-600"
                        >
                          Chat
                        </button>
                      </div>
                    </div>
                  ))}
                  {matchesInvolvingMe.length === 0 && (
                    <p className="text-gray-700 text-center py-4">
                      No matches involving you yet. Ask your friends to match you with someone!
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Chats Tab */}
            {activeTab === 'chats' && (
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Your Chats</h2>
                <div className="space-y-4">
                  {activeChats.map((chat) => (
                    <div
                      key={chat.pubkey}
                      className="p-4 border rounded-lg hover:border-gray-300 transition-colors cursor-pointer"
                      onClick={() => router.push(`/messages?pubkey=${chat.pubkey}`)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0">
                            <img
                              src={chat.profile?.picture || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y'}
                              alt={chat.profile?.name || 'Anonymous'}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div>
                            <h3 className="font-semibold text-gray-900">
                              {chat.profile?.name || 'Anonymous'}
                            </h3>
                            <p className="text-sm text-gray-600 truncate max-w-md">
                              {chat.lastMessage.content}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                              {new Date(chat.lastMessage.created_at * 1000).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <div className="text-custom-green-500">
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                          </svg>
                        </div>
                      </div>
                    </div>
                  ))}
                  {activeChats.length === 0 && (
                    <div className="text-center py-8">
                      <p className="text-gray-600 mb-4">No active conversations</p>
                      <button
                        onClick={() => setActiveTab('friends')}
                        className="px-4 py-2 bg-custom-green-500 text-white rounded-lg hover:bg-custom-green-600"
                      >
                        Start a Chat
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Created Matches Tab */}
            {activeTab === 'created-matches' && (
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Your Created Matches</h2>
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
                                <p className="font-medium text-gray-900">{tag[2] || tag[1].slice(0, 8)}</p>
                                {index === 0 && <span className="text-gray-700">matched with</span>}
                              </div>
                            </div>
                          ))}
                      </div>
                      <p className="text-sm text-gray-700 mt-2">
                        Created: {new Date(match.created_at * 1000).toLocaleString()}
                      </p>
                    </div>
                  ))}
                  {matches.length === 0 && (
                    <p className="text-gray-700 text-center py-4">
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
                  <h2 className="text-xl font-semibold text-gray-900">Your Friends</h2>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setIsAddingFriend(true)}
                      className="px-4 py-2 bg-custom-green-500 text-white rounded-lg hover:bg-custom-green-600"
                    >
                      Add Friend
                    </button>
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
                          <h3 className="font-semibold text-gray-900">{friend.profile?.name || 'Anonymous'}</h3>
                          <p className="text-sm text-gray-700 truncate">{friend.pubkey}</p>
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
                              ? 'bg-[#B71C5D] text-white hover:bg-[#9D1850] border-transparent'
                              : 'border-custom-green-500 text-custom-green-500 hover:bg-custom-green-50'
                          }`}
                        >
                          {selectedFriends.includes(friend.pubkey) ? 'Unselect' : 'Match'}
                        </button>
                      </div>
                    </div>
                  ))}
                  {friends.length === 0 && (
                    <p className="text-gray-700 text-center py-4">
                      No friends found. Add some friends to get started!
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Relays Tab */}
            {activeTab === 'relays' && (
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Manage Relays</h2>
                <form onSubmit={handleAddRelay} className="flex gap-2 mb-4">
                  <input
                    type="text"
                    value={newRelay}
                    onChange={(e) => setNewRelay(e.target.value)}
                    placeholder="wss://relay.example.com"
                    className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-custom-green-500 text-gray-900 placeholder-gray-500"
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
                      <span className="text-gray-900">{relay}</span>
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

            {/* Add Friend Modal */}
            {isAddingFriend && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                <div className="bg-white rounded-lg p-6 max-w-md w-full">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Add New Friend</h3>
                  <form onSubmit={handleAddFriend}>
                    <div className="mb-4">
                      <label htmlFor="pubkey" className="block text-sm font-medium text-gray-700 mb-1">
                        Friend's Public Key
                      </label>
                      <input
                        type="text"
                        id="pubkey"
                        value={newFriendPubkey}
                        onChange={(e) => setNewFriendPubkey(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-custom-green-500"
                        placeholder="npub..."
                        required
                      />
                      {addFriendError && (
                        <p className="mt-1 text-sm text-red-600">{addFriendError}</p>
                      )}
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddingFriend(false);
                          setNewFriendPubkey('');
                          setAddFriendError('');
                        }}
                        className="px-4 py-2 text-gray-700 hover:text-gray-900"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isAddingFriendLoading || !newFriendPubkey}
                        className={`px-4 py-2 bg-custom-green-500 text-white rounded-lg ${
                          isAddingFriendLoading || !newFriendPubkey
                            ? 'opacity-50 cursor-not-allowed'
                            : 'hover:bg-custom-green-600'
                        } flex items-center gap-2`}
                      >
                        {isAddingFriendLoading ? (
                          <>
                            <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Adding...
                          </>
                        ) : (
                          'Add Friend'
                        )}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 
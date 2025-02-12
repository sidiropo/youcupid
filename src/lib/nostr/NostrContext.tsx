'use client';

import NDK, { 
  NDKEvent, 
  NDKFilter, 
  NDKUser, 
  NostrEvent,
  NDKSigner,
  NDKPrivateKeySigner
} from '@nostr-dev-kit/ndk';
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface Nip07RelayMap {
  [url: string]: { read: boolean; write: boolean };
}

interface Nip04 {
  encrypt(pubkey: string, plaintext: string): Promise<string>;
  decrypt(pubkey: string, ciphertext: string): Promise<string>;
}

interface Nip44 {
  encrypt(pubkey: string, plaintext: string): Promise<string>;
  decrypt(pubkey: string, ciphertext: string): Promise<string>;
}

interface NostrWindow {
  getPublicKey(): Promise<string>;
  signEvent(event: NostrEvent): Promise<{ sig: string }>;
  getRelays?(): Promise<Nip07RelayMap>;
  nip04?: Nip04;
  nip44?: Nip44;
}

declare global {
  interface Window {
    nostr?: NostrWindow;
  }
}

interface NostrContextType {
  ndk: NDK | null;
  user: NDKUser | null;
  publicKey: string | null;
  relays: string[];
  isLoading: boolean;
  login: () => Promise<void>;
  logout: () => void;
  addRelay: (relay: string) => Promise<void>;
  removeRelay: (relay: string) => Promise<void>;
  getFriends: () => Promise<NDKUser[]>;
  sendDirectMessage: (recipientPubkey: string, content: string) => Promise<void>;
  createMatch: (friend1: string, friend2: string) => Promise<void>;
  getMatches: () => Promise<NDKEvent[]>;
  getMatchesInvolvingMe: () => Promise<NDKEvent[]>;
}

const NostrContext = createContext<NostrContextType | undefined>(undefined);

export function NostrProvider({ children }: { children: ReactNode }) {
  const [ndk, setNdk] = useState<NDK | null>(null);
  const [user, setUser] = useState<NDKUser | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [relays, setRelays] = useState<string[]>([
    'wss://relay.damus.io',
    'wss://relay.nostr.band',
    'wss://nos.lol',
    'wss://relay.snort.social',
    'wss://nostr.mom',
  ]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    initializeNDK();
  }, [relays]);

  const initializeNDK = async () => {
    try {
      const newNdk = new NDK({
        explicitRelayUrls: relays,
      });
      
      await newNdk.connect();
      setNdk(newNdk);
    } catch (error) {
      console.error('Failed to initialize NDK:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async () => {
    if (!ndk) return;
    try {
      setIsLoading(true);
      // Check if nos2x extension is available
      if (!window.nostr) {
        throw new Error('Nostr extension not found');
      }

      const pubkey = await window.nostr.getPublicKey();
      setPublicKey(pubkey);
      
      const ndkUser = ndk.getUser({ pubkey });
      await ndkUser.fetchProfile();
      setUser(ndkUser);
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    setPublicKey(null);
  };

  const addRelay = async (relay: string) => {
    if (!relays.includes(relay)) {
      setRelays([...relays, relay]);
    }
  };

  const removeRelay = async (relay: string) => {
    setRelays(relays.filter((r) => r !== relay));
  };

  const getFriends = async () => {
    if (!ndk || !publicKey) return [];
    
    const filter: NDKFilter = {
      kinds: [3], // kind 3 is for contacts
      authors: [publicKey],
    };

    const events = await ndk.fetchEvents(filter);
    const friends: NDKUser[] = [];
    
    for (const event of events) {
      const tags = event.tags.filter((tag) => tag[0] === 'p');
      for (const tag of tags) {
        const friendPubkey = tag[1];
        const friendUser = ndk.getUser({ pubkey: friendPubkey });
        await friendUser.fetchProfile();
        friends.push(friendUser);
      }
    }

    return friends;
  };

  const sendDirectMessage = async (recipientPubkey: string, content: string) => {
    if (!ndk || !publicKey) return;
    
    try {
      const event = new NDKEvent(ndk);
      event.kind = 4; // kind 4 is for encrypted direct messages
      event.pubkey = publicKey;
      event.created_at = Math.floor(Date.now() / 1000);
      event.tags = [['p', recipientPubkey]];

      const recipientUser = ndk.getUser({ pubkey: recipientPubkey });
      await event.encrypt(recipientUser);
      event.content = content;
      
      await event.sign();
      await event.publish();
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  };

  const createMatch = async (friend1: string, friend2: string) => {
    if (!ndk || !publicKey || !window.nostr) return;
    
    try {
      // Get user profiles for both friends
      const friend1User = ndk.getUser({ pubkey: friend1 });
      const friend2User = ndk.getUser({ pubkey: friend2 });
      await Promise.all([
        friend1User.fetchProfile(),
        friend2User.fetchProfile(),
      ]);

      const friend1Name = friend1User.profile?.name || friend1.slice(0, 8);
      const friend2Name = friend2User.profile?.name || friend2.slice(0, 8);

      // Create a raw nostr event
      const eventData: Partial<NostrEvent> = {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['p', friend1],
          ['p', friend2],
          ['t', 'youcupid-match'],
          ['friend1_name', friend1Name],
          ['friend2_name', friend2Name],
        ],
        content: `Match created between ${friend1Name} and ${friend2Name}!`,
        pubkey: publicKey,
      };

      // Sign the event using the extension
      const signedEvent = await window.nostr.signEvent(eventData as NostrEvent);

      // Create NDK event from the signed data
      const event = new NDKEvent(ndk);
      event.kind = eventData.kind!;
      event.created_at = eventData.created_at!;
      event.content = eventData.content!;
      event.pubkey = eventData.pubkey!;
      event.tags = eventData.tags!;
      event.sig = signedEvent.sig;

      // Calculate event ID
      await event.toNostrEvent();

      // Publish with options
      const publishPromise = event.publish();
      
      // Wait for either successful publish or timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Publish timeout')), 5000);
      });

      await Promise.race([publishPromise, timeoutPromise]);

      // Wait a moment to ensure propagation
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Try to fetch the event to verify it was published
      const verifyFilter: NDKFilter = {
        kinds: [1],
        ids: [event.id],
      };

      const published = await ndk.fetchEvent(verifyFilter);
      if (!published) {
        throw new Error('Failed to verify event publication');
      }

    } catch (error) {
      console.error('Error creating match:', error);
      throw error;
    }
  };

  const getMatches = async () => {
    if (!ndk || !publicKey) return [];
    
    const filter: NDKFilter = {
      kinds: [1],
      authors: [publicKey],
      '#t': ['youcupid-match'],
    };

    const events = await ndk.fetchEvents(filter);
    const matches = Array.from(events);

    // Fetch user profiles for each match if needed
    for (const match of matches) {
      const friend1Tag = match.tags.find(tag => tag[0] === 'p' && tag[1]);
      const friend2Tag = match.tags.find(tag => tag[1] !== friend1Tag?.[1] && tag[0] === 'p');

      if (friend1Tag && friend2Tag) {
        const friend1User = ndk.getUser({ pubkey: friend1Tag[1] });
        const friend2User = ndk.getUser({ pubkey: friend2Tag[1] });
        
        try {
          await Promise.all([
            friend1User.fetchProfile(),
            friend2User.fetchProfile(),
          ]);

          // Update the match content with user names
          const friend1Name = friend1User.profile?.name || friend1Tag[1].slice(0, 8);
          const friend2Name = friend2User.profile?.name || friend2Tag[1].slice(0, 8);
          match.content = `Match created between ${friend1Name} and ${friend2Name}!`;
        } catch (error) {
          console.warn('Failed to fetch user profiles for match:', error);
        }
      }
    }

    return matches;
  };

  const getMatchesInvolvingMe = async () => {
    if (!ndk || !publicKey) return [];
    
    const filter: NDKFilter = {
      kinds: [1],
      '#t': ['youcupid-match'],
      '#p': [publicKey], // Look for matches involving the current user
    };

    const events = await ndk.fetchEvents(filter);
    const matches = Array.from(events).filter(event => event.pubkey !== publicKey);

    // Fetch user profiles for each match if needed
    for (const match of matches) {
      const friend1Tag = match.tags.find(tag => tag[0] === 'p' && tag[1]);
      const friend2Tag = match.tags.find(tag => tag[1] !== friend1Tag?.[1] && tag[0] === 'p');

      if (friend1Tag && friend2Tag) {
        const friend1User = ndk.getUser({ pubkey: friend1Tag[1] });
        const friend2User = ndk.getUser({ pubkey: friend2Tag[1] });
        
        try {
          await Promise.all([
            friend1User.fetchProfile(),
            friend2User.fetchProfile(),
          ]);

          // Update the match content with user names
          const friend1Name = friend1User.profile?.name || friend1Tag[1].slice(0, 8);
          const friend2Name = friend2User.profile?.name || friend2Tag[1].slice(0, 8);
          match.content = `Match created between ${friend1Name} and ${friend2Name}!`;
        } catch (error) {
          console.warn('Failed to fetch user profiles for match:', error);
        }
      }
    }

    return matches;
  };

  return (
    <NostrContext.Provider
      value={{
        ndk,
        user,
        publicKey,
        relays,
        isLoading,
        login,
        logout,
        addRelay,
        removeRelay,
        getFriends,
        sendDirectMessage,
        createMatch,
        getMatches,
        getMatchesInvolvingMe,
      }}
    >
      {children}
    </NostrContext.Provider>
  );
}

export function useNostr() {
  const context = useContext(NostrContext);
  if (context === undefined) {
    throw new Error('useNostr must be used within a NostrProvider');
  }
  return context;
} 
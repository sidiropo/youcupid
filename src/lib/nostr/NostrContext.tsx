'use client';

import { 
  createContext, 
  useContext, 
  useEffect, 
  useState, 
  ReactNode, 
  useCallback 
} from 'react';

interface NDKEvent {
  id: string;
  kind: number;
  pubkey: string;
  content: string;
  created_at?: number;
  tags: string[][];
  sig?: string;
  encrypt(recipientUser: NDKUser): Promise<void>;
  sign(): Promise<void>;
  publish(): Promise<void>;
  toNostrEvent(): Promise<void>;
}

interface NDKUser {
  pubkey: string;
  profile?: {
    name?: string;
    picture?: string;
  };
  fetchProfile(): Promise<void>;
}

interface NDKFilter {
  kinds?: number[];
  authors?: string[];
  '#p'?: string[];
  '#t'?: string[];
  ids?: string[];
  since?: number;
}

interface NDK {
  connect(): Promise<void>;
  fetchEvents(filter: NDKFilter): Promise<Set<NDKEvent>>;
  fetchEvent(filter: NDKFilter): Promise<NDKEvent | null>;
  getUser(opts: { pubkey: string }): NDKUser;
  subscribe(filter: NDKFilter, opts?: { closeOnEose: boolean }): {
    on(event: string, callback: (event: NDKEvent) => void): void;
    stop(): void;
  };
}

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

interface NostrEvent {
  kind: number;
  created_at: number;
  content: string;
  tags: string[][];
  pubkey: string;
}

interface SimplifiedNDKUser {
  pubkey: string;
  profile: {
    name?: string;
    picture?: string;
  };
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
  getFriends: () => Promise<SimplifiedNDKUser[]>;
  sendDirectMessage: (recipientPubkey: string, content: string) => Promise<void>;
  createMatch: (friend1: string, friend2: string) => Promise<void>;
  getMatches: () => Promise<NDKEvent[]>;
  getMatchesInvolvingMe: () => Promise<NDKEvent[]>;
  updateProfile: (profile: { name?: string; picture?: string; about?: string }) => Promise<void>;
}

const NostrContext = createContext<NostrContextType | undefined>(undefined);

export function NostrProvider({ children }: { children: ReactNode }) {
  const [ndk, setNdk] = useState<NDK | null>(null);
  const [user, setUser] = useState<NDKUser | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [relays, setRelays] = useState<string[]>([
    'wss://purplepag.es',
    'wss://relay.snort.social',
    'wss://relay.damus.io',
    'wss://nostr.wine',
  ]);
  const [isLoading, setIsLoading] = useState(true);

  const initializeNDK = useCallback(async () => {
    try {
      const NDKModule = await import('@nostr-dev-kit/ndk');
      const newNdk = new NDKModule.default({
        explicitRelayUrls: relays,
        enableOutboxModel: true, // This helps with offline/failed relay scenarios
      });
      
      // Don't wait for connect, just set the NDK instance
      setNdk(newNdk);
      
      // Try to connect in the background
      newNdk.connect().catch((error) => {
        console.warn('Some relays failed to connect:', error);
        // Continue anyway as we can still function with some failed relays
      });
    } catch (error) {
      console.error('Failed to initialize NDK:', error);
    } finally {
      setIsLoading(false);
    }
  }, [relays]);

  useEffect(() => {
    initializeNDK();
  }, [initializeNDK]);

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
    
    try {
      console.log('Fetching contact list...');
      // First get the contact list (kind 3)
      const contactFilter: NDKFilter = {
        kinds: [3],
        authors: [publicKey],
      };
      const contactEvents = await ndk.fetchEvents(contactFilter);
      const friends: SimplifiedNDKUser[] = [];
      
      for (const event of contactEvents) {
        const tags = event.tags.filter((tag) => tag[0] === 'p');
        console.log(`Found ${tags.length} friend tags in contact list`);
        
        // Get all friend pubkeys
        const friendPubkeys = tags.map(tag => tag[1]);
        
        if (friendPubkeys.length === 0) continue;

        // Fetch all friend profiles in one go (kind 0)
        console.log('Fetching profiles for friends:', friendPubkeys);
        const profileFilter: NDKFilter = {
          kinds: [0],
          authors: friendPubkeys,
        };
        
        const profileEvents = await ndk.fetchEvents(profileFilter);
        console.log(`Fetched ${profileEvents.size} profile events`);

        // Process each profile event
        for (const profileEvent of profileEvents) {
          try {
            const content = JSON.parse(profileEvent.content);
            console.log('Profile content for', profileEvent.pubkey, ':', content);
            
            friends.push({
              pubkey: profileEvent.pubkey,
              profile: {
                name: content.name,
                picture: content.picture
              }
            });
          } catch (error) {
            console.error(`Failed to parse profile for ${profileEvent.pubkey}:`, error);
          }
        }
      }

      console.log('Final friends list:', friends);
      return friends;
    } catch (error) {
      console.error('Error in getFriends:', error);
      return [];
    }
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
    if (!ndk || !publicKey || !window.nostr) {
      console.error('Create match prerequisites not met:', { 
        hasNdk: !!ndk, 
        hasPublicKey: !!publicKey, 
        hasNostrExtension: !!window.nostr 
      });
      throw new Error('Missing required nostr components');
    }
    
    try {
      console.log('Starting match creation between:', friend1, friend2);
      
      // Get user profiles for both friends
      const friend1User = ndk.getUser({ pubkey: friend1 });
      const friend2User = ndk.getUser({ pubkey: friend2 });
      
      console.log('Fetching user profiles...');
      try {
        await Promise.all([
          friend1User.fetchProfile(),
          friend2User.fetchProfile(),
        ]);
        console.log('Successfully fetched profiles');
      } catch (error) {
        console.error('Failed to fetch user profiles:', error);
        throw error;
      }

      const friend1Name = friend1User.profile?.name || friend1.slice(0, 8);
      const friend2Name = friend2User.profile?.name || friend2.slice(0, 8);

      console.log('Creating event data...');
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

      console.log('Signing event...');
      // Sign the event using the extension
      try {
        const signedEvent = await window.nostr.signEvent(eventData as NostrEvent);
        console.log('Event signed successfully');

        // Create NDK event
        const NDKModule = await import('@nostr-dev-kit/ndk');
        const event = new NDKModule.NDKEvent(ndk, eventData as NostrEvent);
        event.sig = signedEvent.sig;

        // Calculate event ID
        await event.toNostrEvent();
        console.log('Event created with ID:', event.id);

        console.log('Publishing event...');
        // Publish with options
        const publishPromise = event.publish();
        
        // Wait for either successful publish or timeout
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Publish timeout')), 5000);
        });

        await Promise.race([publishPromise, timeoutPromise]);
        console.log('Event published successfully');

        // Wait a moment to ensure propagation
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Try to fetch the event to verify it was published
        console.log('Verifying event publication...');
        const verifyFilter: NDKFilter = {
          kinds: [1],
          ids: [event.id],
        };

        const published = await ndk.fetchEvent(verifyFilter);
        if (!published) {
          throw new Error('Failed to verify event publication');
        }
        console.log('Event verified successfully');

      } catch (error) {
        console.error('Error in event signing/publishing:', error);
        throw error;
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
    const allPubkeys = new Set<string>();

    // Collect all pubkeys from matches
    for (const match of matches) {
      const friendTags = match.tags.filter(tag => tag[0] === 'p');
      friendTags.forEach(tag => allPubkeys.add(tag[1]));
    }

    // Fetch all profiles in one go
    const profileFilter: NDKFilter = {
      kinds: [0],
      authors: Array.from(allPubkeys),
    };
    
    const profileEvents = await ndk.fetchEvents(profileFilter);
    const profiles = new Map<string, { name: string; picture?: string }>();

    // Build a map of profiles
    for (const profileEvent of profileEvents) {
      try {
        const content = JSON.parse(profileEvent.content);
        profiles.set(profileEvent.pubkey, {
          name: content.name || profileEvent.pubkey.slice(0, 8),
          picture: content.picture
        });
      } catch (error) {
        console.warn('Failed to parse profile:', error);
      }
    }

    // Update match content with profile information
    for (const match of matches) {
      const friend1Tag = match.tags.find(tag => tag[0] === 'p' && tag[1]);
      const friend2Tag = match.tags.find(tag => tag[1] !== friend1Tag?.[1] && tag[0] === 'p');

      if (friend1Tag && friend2Tag) {
        const friend1Profile = profiles.get(friend1Tag[1]);
        const friend2Profile = profiles.get(friend2Tag[1]);

        // Add profile information to tags
        match.tags = match.tags.map(tag => {
          if (tag[0] === 'p') {
            const profile = profiles.get(tag[1]);
            if (profile) {
              return [...tag, profile.name, profile.picture || ''];
            }
          }
          return tag;
        });

        // Update content with names
        const friend1Name = friend1Profile?.name || friend1Tag[1].slice(0, 8);
        const friend2Name = friend2Profile?.name || friend2Tag[1].slice(0, 8);
        match.content = `Match created between ${friend1Name} and ${friend2Name}!`;
      }
    }

    return matches;
  };

  const getMatchesInvolvingMe = async () => {
    if (!ndk || !publicKey) return [];
    
    const filter: NDKFilter = {
      kinds: [1],
      '#t': ['youcupid-match'],
      '#p': [publicKey],
    };

    const events = await ndk.fetchEvents(filter);
    const matches = Array.from(events).filter(event => event.pubkey !== publicKey);
    const allPubkeys = new Set<string>();

    // Collect all pubkeys from matches
    for (const match of matches) {
      const friendTags = match.tags.filter(tag => tag[0] === 'p');
      friendTags.forEach(tag => allPubkeys.add(tag[1]));
    }

    // Fetch all profiles in one go
    const profileFilter: NDKFilter = {
      kinds: [0],
      authors: Array.from(allPubkeys),
    };
    
    const profileEvents = await ndk.fetchEvents(profileFilter);
    const profiles = new Map<string, { name: string; picture?: string }>();

    // Build a map of profiles
    for (const profileEvent of profileEvents) {
      try {
        const content = JSON.parse(profileEvent.content);
        profiles.set(profileEvent.pubkey, {
          name: content.name || profileEvent.pubkey.slice(0, 8),
          picture: content.picture
        });
      } catch (error) {
        console.warn('Failed to parse profile:', error);
      }
    }

    // Update match content with profile information
    for (const match of matches) {
      const friend1Tag = match.tags.find(tag => tag[0] === 'p' && tag[1]);
      const friend2Tag = match.tags.find(tag => tag[1] !== friend1Tag?.[1] && tag[0] === 'p');

      if (friend1Tag && friend2Tag) {
        const friend1Profile = profiles.get(friend1Tag[1]);
        const friend2Profile = profiles.get(friend2Tag[1]);

        // Add profile information to tags
        match.tags = match.tags.map(tag => {
          if (tag[0] === 'p') {
            const profile = profiles.get(tag[1]);
            if (profile) {
              return [...tag, profile.name, profile.picture || ''];
            }
          }
          return tag;
        });

        // Update content with names
        const friend1Name = friend1Profile?.name || friend1Tag[1].slice(0, 8);
        const friend2Name = friend2Profile?.name || friend2Tag[1].slice(0, 8);
        match.content = `Match created between ${friend1Name} and ${friend2Name}!`;
      }
    }

    return matches;
  };

  const updateProfile = async (profile: { name?: string; picture?: string; about?: string }) => {
    if (!ndk || !publicKey || !window.nostr) {
      throw new Error('Missing required nostr components');
    }

    try {
      // Create a raw nostr event for profile update (kind 0)
      const eventData: Partial<NostrEvent> = {
        kind: 0,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content: JSON.stringify(profile),
        pubkey: publicKey,
      };

      // Sign the event using the extension
      const signedEvent = await window.nostr.signEvent(eventData as NostrEvent);

      // Create NDK event
      const NDKModule = await import('@nostr-dev-kit/ndk');
      const event = new NDKModule.NDKEvent(ndk, eventData as NostrEvent);
      event.sig = signedEvent.sig;

      // Calculate event ID and publish
      await event.toNostrEvent();
      await event.publish();

      // Update local user state
      if (user) {
        user.profile = { ...user.profile, ...profile };
        setUser({ ...user });
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      throw error;
    }
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
        updateProfile,
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
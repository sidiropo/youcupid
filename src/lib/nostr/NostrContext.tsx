'use client';

import { 
  createContext, 
  useContext, 
  useEffect, 
  useState, 
  ReactNode, 
  useCallback 
} from 'react';
import NDK, { 
  NDKUser, 
  NDKEvent, 
  NDKFilter, 
  NDKSigner, 
  NostrEvent,
  NDKPrivateKeySigner,
  NDKRelay
} from '@nostr-dev-kit/ndk';

interface NDKUserProfile {
  name?: string;
  picture?: string;
  about?: string;
  [key: string]: string | number | undefined;
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
  addFriend: (friendPubkey: string) => Promise<void>;
}

const NostrContext = createContext<NostrContextType | undefined>(undefined);

// Custom signer that uses the browser extension
class BrowserExtensionSigner implements NDKSigner {
  private pubkey: string | null = null;
  private ndk: NDK | null = null;
  private _user: NDKUser | null = null;

  setNDK(ndk: NDK) {
    this.ndk = ndk;
  }

  async user(): Promise<NDKUser> {
    if (!this._user) {
      await this.blockUntilReady();
    }
    if (!this._user) {
      throw new Error('Failed to initialize user');
    }
    return this._user;
  }

  async blockUntilReady(): Promise<NDKUser> {
    if (!window.nostr) {
      throw new Error('Nostr extension not found');
    }
    const pubkey = await this.getPublicKey();
    this._user = new NDKUser({ pubkey });
    return this._user;
  }

  async getPublicKey(): Promise<string> {
    if (!window.nostr) {
      throw new Error('Nostr extension not found');
    }
    if (!this.pubkey) {
      this.pubkey = await window.nostr.getPublicKey();
    }
    return this.pubkey;
  }

  async sign(event: NostrEvent): Promise<string> {
    if (!window.nostr) {
      throw new Error('Nostr extension not found');
    }
    const signedEvent = await window.nostr.signEvent({
      kind: event.kind,
      tags: event.tags,
      content: event.content,
      created_at: event.created_at,
      pubkey: await this.getPublicKey()
    });
    return signedEvent.sig;
  }

  async encrypt(recipient: NDKUser, value: string): Promise<string> {
    if (!window.nostr?.nip04) {
      throw new Error('NIP-04 encryption not supported by extension');
    }
    return window.nostr.nip04.encrypt(recipient.pubkey, value);
  }

  async decrypt(sender: NDKUser, value: string): Promise<string> {
    if (!window.nostr?.nip04) {
      throw new Error('NIP-04 encryption not supported by extension');
    }
    return window.nostr.nip04.decrypt(sender.pubkey, value);
  }

  // Implement required NDKSigner interface methods
  async nip04Encrypt(recipient: NDKUser, value: string): Promise<string> {
    return this.encrypt(recipient, value);
  }

  async nip04Decrypt(sender: NDKUser, value: string): Promise<string> {
    return this.decrypt(sender, value);
  }

  async nip44Encrypt(recipient: NDKUser, value: string): Promise<string> {
    if (!window.nostr?.nip44) {
      throw new Error('NIP-44 encryption not supported by extension');
    }
    return window.nostr.nip44.encrypt(recipient.pubkey, value);
  }

  async nip44Decrypt(sender: NDKUser, value: string): Promise<string> {
    if (!window.nostr?.nip44) {
      throw new Error('NIP-44 encryption not supported by extension');
    }
    return window.nostr.nip44.decrypt(sender.pubkey, value);
  }
}

export function NostrProvider({ children }: { children: ReactNode }) {
  const [ndk, setNdk] = useState<NDK | null>(null);
  const [user, setUser] = useState<NDKUser | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(() => {
    // Try to restore publicKey from localStorage on initialization
    if (typeof window !== 'undefined') {
      return localStorage.getItem('nostr_pubkey');
    }
    return null;
  });
  const [relays, setRelays] = useState<string[]>([
    'wss://relay.damus.io',     // Very reliable relay
    'wss://relay.nostr.band',   // Backup relay
    'wss://nos.lol'            // Backup relay
  ]);
  const [isLoading, setIsLoading] = useState(true);
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  const MAX_CONNECTION_ATTEMPTS = 3;
  const [connectedRelays, setConnectedRelays] = useState<Set<string>>(new Set());
  const [isInitialized, setIsInitialized] = useState(false);

  const removeRelay = useCallback(async (relay: string) => {
    setRelays(prev => prev.filter((r) => r !== relay));
  }, []);

  const addRelay = useCallback(async (relay: string) => {
    setRelays(prev => {
      if (!prev.includes(relay)) {
        return [...prev, relay];
      }
      return prev;
    });
  }, []);

  const initializeNDK = useCallback(async () => {
    // Prevent multiple initialization attempts
    if (isInitialized) {
      return true;
    }

    // Don't check for extension here, we'll do it during login
    console.log('Initializing NDK...');
    
    // If we've tried too many times, stop trying
    if (connectionAttempts >= MAX_CONNECTION_ATTEMPTS) {
      console.log('Max connection attempts reached, stopping initialization');
      setIsLoading(false);
      setIsInitialized(false); // Reset initialization state on failure
      return false;
    }

    try {
      // Create a signer that uses the browser extension
      console.log('Creating browser extension signer...');
      const signer = new BrowserExtensionSigner();
      
      console.log('Creating NDK instance with relays:', relays);
      const newNdk = new NDK({
        explicitRelayUrls: relays,
        enableOutboxModel: false
      });

      // Set up relay connection error handling
      newNdk.pool.on('relay:connect', (relay: NDKRelay) => {
        console.log(`Connected to relay: ${relay.url}`);
        setConnectedRelays(prev => new Set([...prev, relay.url]));
      });

      newNdk.pool.on('relay:disconnect', (relay: NDKRelay) => {
        console.log(`Disconnected from relay: ${relay.url}`);
        setConnectedRelays(prev => {
          const newSet = new Set(prev);
          newSet.delete(relay.url);
          return newSet;
        });
        
        // Only remove relay if we have others available
        if (connectedRelays.size > 1 || relays.length > 1) {
          console.log(`Removing problematic relay: ${relay.url}`);
          removeRelay(relay.url);
        }
      });

      // Set the signer after NDK instance is created
      newNdk.signer = signer;
      signer.setNDK(newNdk);
      
      // Set NDK instance first
      setNdk(newNdk);
      
      try {
        console.log('Attempting to connect to relays:', relays);
        const connectPromise = newNdk.connect();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout')), 10000) // 10 second timeout
        );

        await Promise.race([connectPromise, timeoutPromise]);
        
        // Wait for at least one relay to connect
        const waitForRelayConnection = new Promise((resolve, reject) => {
          const checkRelays = () => {
            if (connectedRelays.size > 0) {
              resolve(true);
            } else if (connectionAttempts >= MAX_CONNECTION_ATTEMPTS) {
              reject(new Error('Failed to connect to any relays'));
            }
          };
          
          // Check every second for 10 seconds
          const interval = setInterval(checkRelays, 1000);
          setTimeout(() => {
            clearInterval(interval);
            reject(new Error('Relay connection timeout'));
          }, 10000);
        });

        await waitForRelayConnection;
        
        console.log('Connected to relays successfully');
        setConnectionAttempts(0); // Reset attempts on success
        setIsInitialized(true);
        
        // After successful connection, fetch profile if we have a publicKey
        if (publicKey) {
          console.log('Fetching profile for:', publicKey);
          const ndkUser = newNdk.getUser({ pubkey: publicKey });
          await ndkUser.fetchProfile();
          setUser(ndkUser);
          console.log('Profile fetched successfully');
        }

        return true; // Indicate successful initialization
      } catch (error) {
        console.error('Failed to connect to relays:', error);
        setConnectionAttempts(prev => prev + 1);
        
        // If we have no connected relays, try to switch to alternative relays
        if (connectedRelays.size === 0 && connectionAttempts < MAX_CONNECTION_ATTEMPTS - 1) {
          console.log('No relays connected, switching to alternative relays...');
          const alternativeRelays = [
            'wss://nostr.mom',
            'wss://relay.snort.social',
            'wss://purplepag.es'
          ].filter(r => !relays.includes(r));
          
          if (alternativeRelays.length > 0) {
            const newRelay = alternativeRelays[0];
            console.log(`Adding alternative relay: ${newRelay}`);
            await addRelay(newRelay);
          }
        }
        
        setIsInitialized(false); // Reset initialization state on failure
        return false; // Indicate failed initialization
      }
    } catch (error) {
      console.error('Failed to initialize NDK:', error);
      setConnectionAttempts(prev => prev + 1);
      setIsInitialized(false); // Reset initialization state on failure
      return false; // Indicate failed initialization
    } finally {
      setIsLoading(false);
    }
  }, [connectionAttempts, publicKey, relays, removeRelay, addRelay, isInitialized, connectedRelays]);

  // Only initialize once when the component mounts
  useEffect(() => {
    if (!isInitialized) {
      initializeNDK();
    }
  }, [initializeNDK, isInitialized]);

  const fetchUserProfile = useCallback(async () => {
    if (!ndk || !publicKey) return;

    try {
      console.log('Fetching user profile for:', publicKey);
      
      // First try to get the profile directly from the network
      const profileFilter: NDKFilter = {
        kinds: [0],
        authors: [publicKey],
      };
      
      // Set a timeout for the fetch operation
      const timeoutPromise = new Promise<Set<NDKEvent>>((_, reject) => 
        setTimeout(() => reject(new Error('Profile fetch timeout')), 5000)
      );
      
      const fetchPromise = ndk.fetchEvents(profileFilter);
      const profileEvents = await Promise.race([fetchPromise, timeoutPromise]);
      
      if (profileEvents.size === 0) {
        console.log('No profile events found');
        return;
      }
      
      // Get the most recent profile event
      const events = Array.from(profileEvents) as NDKEvent[];
      const profileEvent = events.sort((a, b) => (b.created_at || 0) - (a.created_at || 0))[0];
      
      if (profileEvent) {
        try {
          const content = JSON.parse(profileEvent.content);
          const ndkUser = ndk.getUser({ pubkey: publicKey });
          ndkUser.profile = content;
          setUser(ndkUser);
        } catch (parseError) {
          console.error('Failed to parse profile content:', parseError);
        }
      }
    } catch (error) {
      console.error('Failed to fetch user profile:', error);
    }
  }, [ndk, publicKey]);

  // Only fetch profile when NDK changes or when profile is updated
  useEffect(() => {
    if (ndk && publicKey && !user) {
      fetchUserProfile();
    }
  }, [ndk, publicKey, user, fetchUserProfile]);

  const login = async () => {
    try {
      console.log('Starting login process...');
      setIsLoading(true);

      // Check if nos2x extension is available
      if (!window.nostr) {
        console.error('Nostr extension not found during login');
        throw new Error('Nostr extension not found');
      }

      // Initialize NDK if not already initialized
      if (!isInitialized) {
        console.log('NDK not initialized, attempting to initialize...');
        const success = await initializeNDK();
        if (!success) {
          throw new Error('Failed to initialize NDK: Could not connect to any relays');
        }
      }

      console.log('Requesting public key from extension...');
      const pubkey = await window.nostr.getPublicKey();
      console.log('Received public key:', pubkey);
      
      // Store publicKey in localStorage
      localStorage.setItem('nostr_pubkey', pubkey);
      setPublicKey(pubkey);
      console.log('Login process completed successfully');
      
    } catch (error) {
      console.error('Login failed:', error);
      setIsInitialized(false); // Reset initialization state on failure
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    // Clear publicKey from localStorage on logout
    localStorage.removeItem('nostr_pubkey');
    setUser(null);
    setPublicKey(null);
    setIsInitialized(false); // Reset initialization state on logout
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
        const tags = event.tags.filter((tag: string[]) => tag[0] === 'p');
        console.log(`Found ${tags.length} friend tags in contact list`);
        
        // Get all friend pubkeys
        const friendPubkeys = tags.map((tag: string[]) => tag[1]);
        
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
    const matches = Array.from(events) as NDKEvent[];
    const allPubkeys = new Set<string>();

    // Collect all pubkeys from matches
    for (const match of matches) {
      const friendTags = match.tags.filter((tag: string[]) => tag[0] === 'p');
      friendTags.forEach((tag: string[]) => allPubkeys.add(tag[1]));
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
      console.log('Updating profile with:', profile);
      console.log('Connected relays:', Array.from(ndk.pool.relays.keys()));
      
      // Create a raw nostr event for profile update (kind 0)
      const eventData: Partial<NostrEvent> = {
        kind: 0,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
        content: JSON.stringify(profile),
        pubkey: publicKey,
      };

      // Sign the event using the extension
      console.log('Signing event with extension...');
      const signedEvent = await window.nostr.signEvent(eventData as NostrEvent);
      console.log('Event signed successfully');

      // Create NDK event
      const event = new NDKEvent(ndk, eventData as NostrEvent);
      event.sig = signedEvent.sig;

      // Calculate event ID and publish
      await event.toNostrEvent();
      console.log('Publishing event to relays...');
      const publishPromise = event.publish();
      
      // Wait for at least one relay to confirm publication
      const publishResult = await Promise.race([
        publishPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Publish timeout')), 5000))
      ]);
      console.log('Profile update published successfully to relays:', publishResult);

      // Update local user state
      if (user) {
        console.log('Updating local user state...');
        const updatedUser = ndk.getUser({ pubkey: publicKey });
        updatedUser.profile = { ...user.profile, ...profile };
        setUser(updatedUser);
      }

      // Add a small delay before fetching to allow relays to process the update
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Fetch the updated profile to ensure we have the latest data
      console.log('Fetching updated profile to verify...');
      await fetchUserProfile();
    } catch (error) {
      console.error('Error updating profile:', error);
      throw error;
    }
  };

  const addFriend = async (friendPubkey: string) => {
    if (!ndk || !publicKey || !window.nostr) {
      throw new Error('Missing required nostr components');
    }

    try {
      console.log('Adding friend:', friendPubkey);
      
      // Get existing contact list
      const contactFilter: NDKFilter = {
        kinds: [3],
        authors: [publicKey],
      };
      const existingContacts = await ndk.fetchEvents(contactFilter);
      const existingContactEvent = Array.from(existingContacts)[0];
      
      // Get existing friend tags
      const existingTags = existingContactEvent ? existingContactEvent.tags : [];
      const existingFriendTags = existingTags.filter((tag: string[]) => tag[0] === 'p');
      
      // Check if friend already exists
      if (existingFriendTags.some((tag: string[]) => tag[1] === friendPubkey)) {
        throw new Error('Friend already exists in contact list');
      }
      
      // Create new tags array with the new friend
      const newTags = [...existingFriendTags, ['p', friendPubkey]];
      
      // Create a raw nostr event for contact list update (kind 3)
      const eventData: Partial<NostrEvent> = {
        kind: 3,
        created_at: Math.floor(Date.now() / 1000),
        tags: newTags,
        content: '', // Contact list events typically have empty content
        pubkey: publicKey,
      };

      // Sign the event using the extension
      const signedEvent = await window.nostr.signEvent(eventData as NostrEvent);

      // Create NDK event
      const event = new NDKEvent(ndk, eventData as NostrEvent);
      event.sig = signedEvent.sig;

      // Calculate event ID and publish
      await event.toNostrEvent();
      await event.publish();
      console.log('Friend added successfully');
    } catch (error) {
      console.error('Error adding friend:', error);
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
        addFriend,
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
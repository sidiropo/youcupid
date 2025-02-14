'use client';

import { useNostr } from '@/lib/nostr/NostrContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useRef, useCallback } from 'react';
import { NDKEvent, NDKFilter } from '@nostr-dev-kit/ndk';

interface Message {
  id: string;
  content: string;
  created_at: number;
  pubkey: string;
  profile?: {
    name?: string;
    picture?: string;
  };
}

interface NostrWindow {
  nostr?: {
    nip04?: {
      encrypt(pubkey: string, plaintext: string): Promise<string>;
      decrypt(pubkey: string, ciphertext: string): Promise<string>;
    };
  };
}

declare global {
  interface Window extends NostrWindow {}
}

export default function MessagesClient() {
  const { ndk, user, publicKey } = useNostr();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  const [chatPartnerProfile, setChatPartnerProfile] = useState<{ name?: string; picture?: string; } | undefined>(undefined);
  
  // Get pubkey from query parameter
  const pubkey = searchParams.get('pubkey');

  // Validate required props
  useEffect(() => {
    if (!pubkey || !publicKey || !ndk) {
      router.push('/');
    }
  }, [pubkey, publicKey, ndk, router]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const setMessagesIfMounted = useCallback((newMessages: Message[] | ((prev: Message[]) => Message[])) => {
    if (mounted.current) {
      setMessages(newMessages);
    }
  }, []);

  const setLoadingIfMounted = useCallback((isLoading: boolean) => {
    if (mounted.current) {
      setLoading(isLoading);
    }
  }, []);

  const loadMessages = useCallback(async () => {
    if (!ndk || !publicKey || !pubkey) return;

    try {
      const nostr = window.nostr;
      if (!nostr?.nip04) {
        throw new Error('NIP-04 encryption not supported by extension');
      }

      // Fetch chat partner's profile
      const chatPartnerUser = ndk.getUser({ pubkey });
      await chatPartnerUser.fetchProfile();
      if (mounted.current) {
        setChatPartnerProfile(chatPartnerUser.profile ? {
          name: chatPartnerUser.profile.name,
          picture: typeof chatPartnerUser.profile.picture === 'string' ? chatPartnerUser.profile.picture : undefined
        } : undefined);
      }

      const filter: NDKFilter = {
        kinds: [4],
        authors: [publicKey, pubkey],
        '#p': [pubkey, publicKey],
      };

      const events = await ndk.fetchEvents(filter);
      const sortedMessages = await Promise.all(
        Array.from(events).map((event: unknown) => {
          const ndkEvent = event as NDKEvent;
          return (async () => {
            try {
              const decryptedContent = await nostr.nip04!.decrypt(
                ndkEvent.pubkey === publicKey ? pubkey : ndkEvent.pubkey,
                ndkEvent.content
              );

              const messageProfile = ndkEvent.pubkey === publicKey 
                ? (user?.profile ? {
                    name: user.profile.name,
                    picture: typeof user.profile.picture === 'string' ? user.profile.picture : undefined
                  } : undefined)
                : chatPartnerUser.profile ? {
                    name: chatPartnerUser.profile.name,
                    picture: typeof chatPartnerUser.profile.picture === 'string' ? chatPartnerUser.profile.picture : undefined
                  } : undefined;

              return {
                id: ndkEvent.id,
                content: decryptedContent,
                created_at: ndkEvent.created_at!,
                pubkey: ndkEvent.pubkey,
                profile: messageProfile
              };
            } catch (error) {
              console.error('Error decrypting message:', error);
              return {
                id: ndkEvent.id,
                content: '(Unable to decrypt message)',
                created_at: ndkEvent.created_at!,
                pubkey: ndkEvent.pubkey,
                profile: ndkEvent.pubkey === publicKey 
                  ? (user?.profile ? {
                      name: user.profile.name,
                      picture: typeof user.profile.picture === 'string' ? user.profile.picture : undefined
                    } : undefined)
                  : chatPartnerProfile
              };
            }
          })();
        })
      );

      sortedMessages.sort((a, b) => a.created_at - b.created_at);
      setMessagesIfMounted(sortedMessages);
      setLoadingIfMounted(false);
      scrollToBottom();
    } catch (error) {
      console.error('Error loading messages:', error);
      setLoadingIfMounted(false);
    }
  }, [ndk, publicKey, pubkey, setMessagesIfMounted, setLoadingIfMounted, user, mounted]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    if (!ndk || !publicKey || !pubkey) return;

    loadMessages();

    // Subscribe to new messages
    const filter: NDKFilter = {
      kinds: [4],
      authors: [publicKey, pubkey],
      '#p': [pubkey, publicKey],
      since: Math.floor(Date.now() / 1000) // Only get messages from now onwards
    };

    const seenMessageIds = new Set<string>(); // Track seen message IDs
    const subscription = ndk.subscribe(filter);
    
    subscription.on('event', async (event: NDKEvent) => {
      if (!mounted.current) return;
      
      // Skip if we've already processed this message
      if (seenMessageIds.has(event.id)) return;
      seenMessageIds.add(event.id);
      
      try {
        const nostr = window.nostr;
        if (!nostr?.nip04) return;

        const decryptedContent = await nostr.nip04.decrypt(
          event.pubkey === publicKey ? pubkey : event.pubkey,
          event.content
        );

        // Get the chat partner's profile for new messages
        const messageProfile = event.pubkey === publicKey 
          ? (user?.profile ? {
              name: user.profile.name,
              picture: typeof user.profile.picture === 'string' ? user.profile.picture : undefined
            } : undefined)
          : chatPartnerProfile;

        const newMessage: Message = {
          id: event.id,
          content: decryptedContent,
          created_at: event.created_at!,
          pubkey: event.pubkey,
          profile: messageProfile
        };

        setMessagesIfMounted(prev => {
          // Check if message already exists in the array
          if (prev.some(msg => msg.id === newMessage.id)) {
            return prev;
          }
          const updatedMessages = [...prev, newMessage];
          return updatedMessages.sort((a, b) => a.created_at - b.created_at);
        });
        scrollToBottom();
      } catch (error) {
        console.error('Error processing new message:', error);
      }
    });

    return () => {
      subscription.stop();
    };
  }, [ndk, publicKey, pubkey, setMessagesIfMounted, scrollToBottom, user, chatPartnerProfile]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const nostr = window.nostr;
    if (!newMessage.trim() || !ndk || !pubkey || !nostr?.nip04) {
      console.error('Missing required components for sending message');
      return;
    }

    try {
      // Encrypt the message content using the browser extension's nip04.encrypt
      const encryptedContent = await nostr.nip04.encrypt(pubkey, newMessage);

      // Create and publish the event
      const event = new NDKEvent(ndk);
      event.kind = 4;
      event.content = encryptedContent;
      event.tags = [['p', pubkey]];
      await event.publish();
      
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Failed to send message. Please try again.');
    }
  };

  if (!pubkey || !publicKey || !ndk) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-2xl text-gray-600">Invalid user</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-2xl text-gray-600">Loading messages...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="bg-white shadow-sm p-4">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <button
            onClick={() => router.push('/dashboard')}
            className="text-gray-600 hover:text-gray-800"
          >
            ← Back to Dashboard
          </button>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full overflow-hidden">
              <img
                src={chatPartnerProfile?.picture || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y'}
                alt={chatPartnerProfile?.name || 'Anonymous'}
                className="w-full h-full object-cover"
              />
            </div>
            <h1 className="text-xl font-semibold text-gray-800">
              Chat with {chatPartnerProfile?.name || pubkey.slice(0, 8)}...
            </h1>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex items-start gap-2 ${
                message.pubkey === publicKey ? 'justify-end' : 'justify-start'
              }`}
            >
              {message.pubkey !== publicKey && (
                <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
                  <img
                    src={message.profile?.picture || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y'}
                    alt={message.profile?.name || 'Anonymous'}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div
                className={`max-w-[70%] p-3 rounded-lg ${
                  message.pubkey === publicKey
                    ? 'bg-custom-green-500 text-white'
                    : 'bg-white text-gray-800'
                }`}
              >
                <p>{message.content}</p>
                <p
                  className={`text-xs mt-1 ${
                    message.pubkey === publicKey
                      ? 'text-custom-green-100'
                      : 'text-gray-500'
                  }`}
                >
                  {new Date(message.created_at * 1000).toLocaleString()}
                </p>
              </div>
              {message.pubkey === publicKey && (
                <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0">
                  <img
                    src={message.profile?.picture || 'https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&f=y'}
                    alt={message.profile?.name || 'Anonymous'}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Message Input */}
      <div className="bg-white border-t p-4">
        <form
          onSubmit={handleSendMessage}
          className="max-w-4xl mx-auto flex gap-2"
        >
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Type your message..."
            className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-custom-green-500"
          />
          <button
            type="submit"
            className="px-6 py-2 bg-custom-green-500 text-white rounded-lg hover:bg-custom-green-600 disabled:opacity-50"
            disabled={!newMessage.trim()}
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
} 
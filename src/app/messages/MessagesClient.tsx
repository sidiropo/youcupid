'use client';

import { useNostr } from '@/lib/nostr/NostrContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import { NDKEvent, NDKFilter } from '@nostr-dev-kit/ndk';

interface Message {
  id: string;
  content: string;
  created_at: number;
  pubkey: string;
}

export default function MessagesClient() {
  const { ndk, user, publicKey } = useNostr();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Get pubkey from query parameter
  const pubkey = searchParams.get('pubkey');

  useEffect(() => {
    if (!user || !ndk || !pubkey) {
      router.push('/');
      return;
    }

    const loadMessages = async () => {
      try {
        const filter: NDKFilter = {
          kinds: [4], // kind 4 is for encrypted direct messages
          authors: [publicKey!, pubkey],
          '#p': [pubkey, publicKey!],
        };

        const events = await ndk.fetchEvents(filter);
        const sortedMessages = Array.from(events)
          .map(event => ({
            id: event.id,
            content: event.content,
            created_at: event.created_at!,
            pubkey: event.pubkey,
          }))
          .sort((a, b) => a.created_at - b.created_at);

        setMessages(sortedMessages);
        setLoading(false);
        scrollToBottom();
      } catch (error) {
        console.error('Error loading messages:', error);
        setLoading(false);
      }
    };

    // Subscribe to new messages
    const subscription = ndk.subscribe(
      {
        kinds: [4],
        authors: [publicKey!, pubkey],
        '#p': [pubkey, publicKey!],
        since: Math.floor(Date.now() / 1000),
      },
      {
        closeOnEose: false,
      }
    );

    subscription.on('event', (event: NDKEvent) => {
      setMessages(prev => [
        ...prev,
        {
          id: event.id,
          content: event.content,
          created_at: event.created_at!,
          pubkey: event.pubkey,
        },
      ]);
      scrollToBottom();
    });

    loadMessages();

    return () => {
      subscription.stop();
    };
  }, [ndk, user, publicKey, pubkey, router]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !ndk || !pubkey) return;

    try {
      const event = new NDKEvent(ndk);
      event.kind = 4;
      event.content = newMessage;
      event.tags = [['p', pubkey]];

      const recipientUser = ndk.getUser({ pubkey });
      await event.encrypt(recipientUser);
      await event.publish();
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Failed to send message. Please try again.');
    }
  };

  if (!pubkey) {
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
          <h1 className="text-xl font-semibold text-gray-800">
            Chat with {pubkey.slice(0, 8)}...
          </h1>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
        <div className="max-w-4xl mx-auto space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${
                message.pubkey === publicKey ? 'justify-end' : 'justify-start'
              }`}
            >
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
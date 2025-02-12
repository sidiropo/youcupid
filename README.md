# YouCupid - A Decentralized Dating App

YouCupid is a decentralized dating application built on the nostr protocol. It allows users to connect with their friends, create matches between them, and communicate securely through encrypted direct messages.

## Features

- **Login via Browser Extension**: Secure authentication using nostr browser extensions (e.g., nos2x)
- **Relay Management**: Add and remove nostr relays to customize your network connectivity
- **Friends List**: View and interact with your nostr contacts
- **Direct Messaging**: Send encrypted messages to your contacts
- **Matching System**: Create potential matches between your friends
- **Real-time Updates**: Get instant notifications for new messages and matches

## Prerequisites

Before you start, make sure you have:

1. Node.js (v18 or later)
2. A nostr browser extension (e.g., nos2x) installed
3. npm or yarn package manager

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd youcupid
```

2. Install dependencies:
```bash
npm install
# or
yarn install
```

3. Start the development server:
```bash
npm run dev
# or
yarn dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

1. **Login**:
   - Make sure your nostr browser extension is installed and enabled
   - Click the "Login with Nostr" button on the homepage
   - Approve the public key request in your browser extension

2. **Managing Relays**:
   - Add new relays using the relay management section
   - Remove relays you don't want to connect to
   - Default relays are provided for initial connectivity

3. **Viewing Friends**:
   - Your nostr contacts will be displayed in the friends list
   - Click on a friend's card to open a direct message conversation

4. **Creating Matches**:
   - Navigate to the Create Match page
   - Select two friends from your contacts list
   - Click "Create Match" to notify both friends

5. **Messaging**:
   - Open a chat by clicking on a friend in the dashboard
   - Type your message and click send
   - Messages are end-to-end encrypted using nostr's encryption

## Technology Stack

- Next.js 14 with App Router
- TypeScript
- Tailwind CSS
- NDK (Nostr Development Kit)
- nostr-tools

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Security

All messages are encrypted using nostr's encryption protocol. However, please note that relay operators can see metadata about your communications (but not the content of encrypted messages).

## Support

If you encounter any issues or have questions, please file an issue in the GitHub repository.

# Droply

Share anything, instantly. Create temporary rooms to share text, files, code snippets, and URLs with end-to-end encryption.

## Features

- **Temporary Rooms**: Create shareable rooms with customizable expiry times
- **End-to-End Encryption**: Password-protected rooms with client-side encryption
- **Multiple Content Types**: Share text, files, code snippets, and URLs
- **View/Edit Links**: Separate links for viewing and editing content
- **No Registration Required**: Start sharing immediately, no signup needed

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **UI Components**: shadcn/ui + Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Storage + Realtime)
- **Encryption**: Web Crypto API (AES-GCM, PBKDF2)

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Supabase account and project

### Installation

```bash
# Install dependencies
npm install

# Set up environment variables
# Create a .env file in the root directory:
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Database Setup

1. Open your Supabase project dashboard
2. Go to SQL Editor
3. Run the SQL script from `supabase/setup_complete.sql`
4. This will create all necessary tables, policies, and functions

### Development

```bash
# Start the development server
npm run dev
```

The app will be available at `http://localhost:8080`

### Building for Production

```bash
# Build for production
npm run build

# Preview production build
npm run preview
```

## Project Structure

```
droply-main/
├── src/
│   ├── components/      # React components
│   ├── pages/           # Page components
│   ├── lib/             # Utilities (crypto, etc.)
│   └── integrations/    # Supabase client
├── supabase/
│   ├── migrations/      # Database migrations
│   └── setup_complete.sql  # Complete setup script
└── public/              # Static assets
```

## Security Features

- Password hashing with SHA-256
- Client-side encryption using AES-GCM
- Row Level Security (RLS) policies
- Secure room settings updates via RPC functions
- Separate tokens for content editing and settings management

## License

MIT

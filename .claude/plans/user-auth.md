# User Authentication — Supabase Auth + Next.js

## Decision
Use Supabase Auth for all user authentication (Google, Discord, email/password).

## Current State
- Next.js 16 app with App Router, React 19, TypeScript, Tailwind CSS 4
- Card data in local SQLite (read-only, better-sqlite3)
- Votes in local SQLite (`mtgink_votes.db`) — currently anonymous via localStorage session IDs
- No auth, no user accounts

## What Supabase Gives Us
- Google OAuth, Discord OAuth, email/password — config only, no auth code
- Hosted Postgres for user data (votes, favorites, collections)
- JWT tokens for API auth
- `@supabase/ssr` package for Next.js App Router integration
- Free tier: 50K MAU, 500MB DB, 1GB storage

## Implementation Plan

### Phase 1: Supabase Project Setup
1. Create Supabase project at supabase.com
2. Enable auth providers in dashboard:
   - Google (needs Google Cloud Console OAuth credentials)
   - Discord (needs Discord Developer Portal app)
   - Email/password (on by default)
3. Note project URL + anon key + service role key

### Phase 2: Install Dependencies
```bash
cd web
npm install @supabase/supabase-js @supabase/ssr
```

### Phase 3: Supabase Client Setup
Create two clients following Supabase SSR docs:

- `lib/supabase/client.ts` — browser client (for client components)
- `lib/supabase/server.ts` — server client (for server components, API routes)
- `lib/supabase/middleware.ts` — refresh session on every request

### Phase 4: Auth Middleware
- `web/middleware.ts` — Next.js middleware that refreshes Supabase session
- Runs on every request to keep auth tokens fresh
- Does NOT block unauthenticated users (voting should work without login)

### Phase 5: Auth UI
- Add Sign In / Sign Up buttons to Navbar
- Auth page (`/auth`) with Google, Discord, and email/password options
- Use Supabase `signInWithOAuth()` for social, `signInWithPassword()` for email
- Callback route (`/auth/callback`) to handle OAuth redirects
- Show user avatar/name in Navbar when logged in, Sign Out button

### Phase 6: Link Votes to Users
- When logged in, `POST /api/vote` includes user ID from Supabase session
- When not logged in, continue using localStorage session_id (anonymous)
- Add `user_id` column to votes table (nullable, for anonymous votes)
- Future: migrate anonymous votes to user account on first login

### Phase 7: User Profiles (Supabase Postgres)
```sql
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE,
    display_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, display_name, avatar_url)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
        NEW.raw_user_meta_data->>'avatar_url'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

## Files to Create/Modify
- **New**: `web/src/lib/supabase/client.ts` — browser Supabase client
- **New**: `web/src/lib/supabase/server.ts` — server Supabase client
- **New**: `web/src/lib/supabase/middleware.ts` — session refresh helper
- **New**: `web/middleware.ts` — Next.js middleware
- **New**: `web/src/app/auth/page.tsx` — sign in/up page
- **New**: `web/src/app/auth/callback/route.ts` — OAuth callback handler
- **Modify**: `web/src/components/Navbar.tsx` — add auth state + sign in/out
- **Modify**: `web/src/app/api/vote/route.ts` — attach user_id when available
- **New**: `web/.env.local` — Supabase URL + anon key (gitignored)

## Data Architecture
- **Card data**: stays in local SQLite (`data/mtgink.db`, read-only)
- **Votes/ratings**: stays in local SQLite for now (`data/mtgink_votes.db`)
- **User data**: Supabase Postgres (profiles, preferences, future collections)
- Future: migrate votes to Supabase Postgres when deploying to production

## Open Questions
- Email verification required before voting?
- Username requirements? (unique, min length, allowed chars)
- Should we show "Sign in to save your votes" prompt?

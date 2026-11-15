---
name: budgetbud
description: Project rules for BudgetBud, a personal budgeting app built with Expo and Supabase. Load before writing, reviewing, or planning any BudgetBud code, schema, Edge Function, import path, categorization logic, or advice feature. Use together with the official expo-* and supabase skills, which cover general framework practice. This skill covers only what is specific to BudgetBud.
---

# BudgetBud project rules

BudgetBud imports a user's spending from several sources, merges duplicates, sorts each purchase into a category, flags new merchants, and shows where the money goes. It starts as a personal app and may later be sold on the App Store and Google Play, so build it as a multi-user product from the start.

For framework practice, load the official skills first: `expo-overview` (it routes to the other `expo-*` and `eas-*` skills) and `supabase`. Follow this file where it is stricter.

## Stack

| Layer | Choice |
|---|---|
| App | Expo with Expo Router, TypeScript, one codebase for iOS, Android, and web |
| Backend | Supabase: Postgres, Auth, Storage, Edge Functions |
| Bank sync | Teller first (free tier). Plaid later if the app is sold. |
| Statement files | CSV and OFX, parsed in the app's own code |
| Merchant sorting | Rules first, then an AI model for merchants the rules do not know |
| PDFs and receipt photos | Claude API, called only from Edge Functions |
| Store releases | EAS Build and Submit |

Run the app as a development build, not Expo Go, once any native module is added.

## Rules that are never optional

### Secrets stay on the server
- Only the Supabase URL and the publishable key may use the `EXPO_PUBLIC_` prefix. Expo inlines `EXPO_PUBLIC_` values into the app bundle, so anyone can read them.
- The Claude API key, Teller or Plaid credentials, and the Supabase service role key live only in Edge Function secrets, read with `Deno.env.get`.
- The app never calls Claude, Teller, or Plaid directly. It calls an Edge Function, and the function calls the outside service.

### Every row belongs to one user
- Every table holding user data has a `user_id` column referencing `auth.users`, with Row Level Security enabled in the same migration that creates the table.
- Write policies as `using ((select auth.uid()) = user_id)` with `to authenticated`. The `select` wrapper lets Postgres evaluate the function once per statement.
- Index every `user_id` column with a btree index where it is the leading column.
- User-facing Edge Functions use `withSupabase({ auth: 'user' })` from `npm:@supabase/server` and do their work through `ctx.supabase`, which RLS scopes to the caller. Use `ctx.supabaseAdmin` only for jobs with no user, such as scheduled bank syncs, and filter by `user_id` explicitly there.
- Storage buckets for statements and receipts are private, with policies keyed to the uploader's user id.

### Users can delete everything
Apple requires in-app account deletion for any app with account creation. Deleting an account removes the user's purchases, uploaded files, bank connections (revoke them with the provider too), and the auth user. Build this early, not before launch.

### Advice stays on budgeting
Advice may describe and compare the user's own spending, such as "dining is up 30% this month" or "you could save $40 by cutting two subscriptions." It must never recommend investments, securities, funds, loans, or insurance products. That line keeps the app clear of investment-adviser rules.

## Domain behavior

### One purchase list, many sources
Purchases arrive from bank sync, CSV or OFX files, AI-read PDFs, and receipt photos. Keep the source of every purchase, and keep the raw imported record so a merge can be undone.

### Merging duplicates
- Merge automatically when two records match on amount, fall within a few days of each other, and have similar merchant names. Keep one purchase and link the merged source records to it.
- A user can split a wrong merge, and the split must stick. Re-importing must not merge the same pair again.
- Receipt photos never create a purchase. A receipt attaches item details to the purchase it matches. If nothing matches yet, it waits and retries when new purchases arrive.
- Re-importing the same file or re-syncing the same date range must not create duplicates.

### Sorting into categories
1. Apply the user's own rules first, then built-in merchant rules.
2. Send only unknown merchants to the AI model, and cache the answer as a rule so the same merchant never costs a second call.
3. When the user changes a category, save that as a rule for that merchant.
4. Normalize merchant names before matching. Card processors add store numbers, locations, and prefixes.

### New places
A merchant is new when the user's history has no earlier purchase from it after normalization. Flag it when it first appears, and let the user dismiss the flag.

## AI calls

- Call AI services only from Edge Functions, and log token usage per user so per-user cost stays visible.
- Use structured output for anything the app parses, such as extracted transactions or categories, never free-text parsing.
- Show extracted PDF and receipt lines for review, and let the user fix a misread line before it is saved.
- The model choice for each job is the user's decision. Until they choose, use the model the plan names. Check the `claude-api` skill for current model IDs and request shapes rather than relying on memory.
- Set a monthly spending limit in the Claude Console before connecting real data.

## When the app is sold

These are deferred, but don't make choices that block them:
- Switching bank sync from Teller to Plaid. Keep the provider behind one import interface.
- Apple FinanceKit for Apple Card, Apple Cash, and Savings data. It needs Apple's approval and a company developer account.
- Subscriptions. Plaid and AI costs recur per user, so a one-time price probably won't cover them.
- A privacy policy that names Supabase, the bank provider, and the AI provider as data processors.
- A legal check of the FTC Safeguards Rule before charging anyone.

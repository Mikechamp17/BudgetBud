---
title: BudgetBud Core Loop - Plan
type: feat
date: 2026-11-15
topic: budgetbud-core-loop
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
execution: code
---

# BudgetBud Core Loop - Plan

## Goal Capsule

- **Objective:** The owner can see where their money goes, by category and by place, on their phone and laptop, without tracking spending by hand. The same app can later be sold on the App Store and Google Play without a rebuild.
- **Means:** One Expo app for iOS, Android, and web, backed by Supabase. Purchases arrive from four import paths, merge into one list, and get sorted into categories.
- **Product authority:** The repository owner decides product behavior and scope. Budgeting advice, emailed receipts, and Apple FinanceKit are not active scope for this plan.
- **Open blockers:** None.

---

## Product Contract

### Summary

Build the BudgetBud foundation: sign-in, four ways to bring in purchases, automatic merging of duplicates, sorting into categories with a flag for new places, and a clear view of spending. It runs on the owner's phone and laptop at close to no cost, and holds up as a multi-user product if it is sold later.

### Problem Frame

The owner wants to know where their money goes but has no single place that pulls their spending together. Bank apps show one account each, and sorting purchases by hand is the kind of chore that stops after a few weeks.

The owner may also sell the app later. A personal tool that stores data on one device, or a web page in a store wrapper, would need a rebuild at that point. Apple can reject apps that are mostly a website in a wrapper. Once other people sign up, the app holds strangers' bank data, so per-user data separation and account deletion are expensive to add after launch.

### Key Decisions

- **Expo with Supabase for everything.** One codebase covers iPhone, Android, and the laptop through the web build, and Supabase provides the database, sign-in, storage, and server functions. (session-settled: user-directed, chosen over a custom backend server and over a local-first synced database: fewest moving parts for a solo builder, and the local-first sync risks mixing up financial data.) Governs R1, R2.
- **Data lives in the cloud with user accounts.** (session-settled: user-directed, chosen over device-only storage: phone and laptop stay in sync, at the cost of securing every user's financial data.) Governs R2, R3, R4.
- **Four import paths in the first version.** Statement files, AI-read PDF statements, automatic bank sync, and receipt photos. (session-settled: user-directed, chosen over starting with statement files only: the owner wants every source available from the start.) Governs R5, R6, R7, R8.
- **Forwarded email receipts are out.** (session-settled: user-directed, chosen over keeping them as a fifth path: the app does not need an inbox.)
- **Duplicates merge automatically, with undo.** (session-settled: user-directed, chosen over confirming each suspected duplicate and over one source per account: manual confirmation gets tedious, and one source per account cannot fill gaps.) Governs R9, R10, R11.
- **Free tiers first, paid services when the app is sold.** Teller's free tier for bank sync, Supabase's free tier, and a free open-model API for sorting merchants. (session-settled: user-approved, chosen over paid services from day one: the owner is the only user for now.) Governs R7, R13.
- **Claude reads PDFs and receipt photos, through an API key on the server.** Accuracy matters most for these jobs, and the owner's Claude subscription cannot be used by an app. The proposed model is Claude Sonnet 5.5. (session-settled: user-approved, chosen over an open model for every AI job: open models misread messy statements and receipts more often.) Governs R6, R8, R18, R19.
- **Advice stays on budgeting, never investments.** Recommending investments, securities, or other financial products can trigger investment-adviser registration. Applies to the later advice work, recorded here so nothing in this plan crosses the line.

<!-- ce-section: work-relationships -->
### How This Work Fits Together

This plan covers the core loop: bring purchases in, merge them, sort them, and show them. The breakdown below is the current understanding, not a committed roadmap.

- **Budgeting advice:** suggestions based on the user's sorted spending.
  - Depends on this plan's sorted purchase history, ideally a few months of it.
  - Still to decide: what advice looks like, how often it appears, and which model writes it.
- **Selling the app:** store listings, subscriptions, privacy policy, and a legal check.
  - Depends on this plan's account separation (R3) and account deletion (R4).
  - Shares the bank-sync interface with a later move from Teller to Plaid.
- **Apple FinanceKit:** Apple Card, Apple Cash, and Apple Savings data on iPhone.
  - Can proceed independently of advice. Needs a company developer account and Apple's approval.
  - Enables a fifth import path that feeds the same merging (R9).

### Requirements

**Accounts and platform**

- R1. One app runs on iPhone, Android, and the web, and the web build works on a laptop browser.
- R2. A user signs in and sees the same purchases, categories, and rules on every device they use.
- R3. A user can see, change, and delete only their own data, enforced by the database rather than the app.
- R4. A user can delete their account from inside the app, which removes their purchases, uploaded files, bank connections, and sign-in.

**Bringing purchases in**

- R5. A user can upload CSV and OFX statement files, and each row becomes a purchase.
- R6. A user can upload a PDF statement, and the extracted purchases appear for review so the user can fix a misread line before saving.
- R7. A user can link a bank account, and new purchases arrive automatically without uploads.
- R8. A user can photograph a receipt, and its item details attach to the matching purchase. A receipt never creates a purchase.

**Merging duplicates**

- R9. When the same purchase arrives from more than one source, the app keeps one purchase, matching on equal amount, a date within a few days, and a similar merchant name.
- R10. A user can split a wrong merge, and later imports never merge that pair again.
- R11. Importing the same file or syncing the same date range twice creates no new purchases.
- R12. Every purchase keeps a record of which sources it came from.

**Sorting and new places**

- R13. Every purchase gets a category, from the user's own rules first, then built-in merchant rules, then an AI model for merchants the rules do not know.
- R14. When a user changes a purchase's category, the app applies that choice to future purchases from the same merchant.
- R15. A purchase from a merchant with no earlier purchase in the user's history is flagged as a new place, and the user can dismiss the flag.

**Seeing where money goes**

- R16. A user sees total spending by category for a month and can compare it with earlier months.
- R17. A user can browse purchases and filter them by category, account, month, and new places.

**Security and cost**

- R18. AI keys, bank-connection credentials, and the database's admin key exist only on the server, never in the app.
- R19. Each user's AI usage is recorded, so the cost per user stays visible.

### Key Flows

- F1. First setup
  - **Trigger:** The owner installs the app or opens the web build for the first time.
  - **Steps:** Create an account; link a bank account or upload a statement; purchases appear, merged and sorted, with new places flagged.
  - **Outcome:** A first month of spending shows by category.
  - **Covered by:** R2, R5, R7, R9, R13, R15, R16
- F2. PDF statement import
  - **Trigger:** The user uploads a PDF statement.
  - **Steps:** The server reads the PDF; extracted purchases appear for review; the user fixes any misread line and saves; saved purchases merge with existing ones and get sorted.
  - **Outcome:** The statement's purchases join the list without duplicates.
  - **Covered by:** R6, R9, R11, R13
- F3. Receipt photo
  - **Trigger:** The user photographs a receipt.
  - **Steps:** The server reads the receipt; the app finds the matching purchase; the item details attach to it.
  - **Outcome:** The purchase shows what was bought.
  - **Covered by:** R8, R9

### Acceptance Examples

- AE1. Covers R9, R12.
  - **Given:** A $42.17 purchase at "TARGET T-1234" arrived through bank sync on March 3.
  - **When:** The user uploads a CSV with a $42.17 purchase at "Target" dated March 4.
  - **Then:** The list shows one purchase, and it lists both sources.
- AE2. Covers R10.
  - **Given:** The app merged two real $5.00 coffee purchases from the same café on the same day.
  - **When:** The user splits them, then re-uploads the same statement.
  - **Then:** Both purchases stay separate.
- AE3. Covers R8.
  - **Given:** No purchase matches a new receipt photo yet.
  - **When:** The matching purchase arrives through bank sync two days later.
  - **Then:** The receipt's item details attach to it, and no extra purchase was ever created.
- AE4. Covers R14.
  - **Given:** The app sorted a purchase at "Joe's Market" as Dining.
  - **When:** The user changes it to Groceries.
  - **Then:** The next purchase at Joe's Market is sorted as Groceries without an AI call.
- AE5. Covers R15.
  - **Given:** The user has six months of purchases, none at "Blue Bottle".
  - **When:** A Blue Bottle purchase arrives.
  - **Then:** It is flagged as a new place. A second Blue Bottle purchase the next week is not.
- AE6. Covers R6.
  - **Given:** A PDF statement where the AI misreads $18.40 as $184.00.
  - **When:** The user corrects the amount during review and saves.
  - **Then:** The saved purchase shows $18.40.

### Success Criteria

- The owner imports a month of their own statements, sees spending by category on both phone and laptop, and gets flagged when they spend somewhere new.
- Running the app for one user costs close to $0 a month, with AI usage in the range of pennies.

### Scope Boundaries

**Deferred for later**

- Budgeting advice, as its own brainstorm.
- Forwarded email receipts.
- Apple FinanceKit for Apple Card, Apple Cash, and Apple Savings.
- Switching bank sync from Teller to Plaid when Teller's free tier no longer fits.
- Offline use with a full copy of the data on each device.
- Subscriptions, store listings, a privacy policy, and the legal review needed before charging anyone.

**Outside this product's identity**

- Moving money, paying bills, or lending. BudgetBud only reads spending.
- Investment, securities, loan, or insurance recommendations.

### Dependencies / Assumptions

- The owner's banks are US banks that Teller supports. Teller's free tier reportedly allows up to 100 live connections.
- The owner's banks offer CSV or OFX downloads, or PDF statements for the AI path.
- The project stays on Supabase. The owner mentioned AWS at work but did not ask to host there.
- Reading Google Wallet or Google Pay data needs no work, because those payments already appear in the linked card's bank account.

### Outstanding Questions

**Deferred to Planning**

- What date window and name-similarity rule define a match for R9?
- Which categories ship as the built-in list for R13?
- Which free open-model API sorts merchants for R13, Groq or Cloudflare Workers AI?
- Which chart types present R16 on a phone screen?
- How should a receipt that never finds a matching purchase be shown to the user (R8)?

### Sources / Research

- `.claude/skills/budgetbud/SKILL.md`: the project's standing rules for secrets, per-user data separation, account deletion, merging, sorting, and advice.
- `.claude/skills/supabase/SKILL.md` and `.claude/skills/expo-overview/SKILL.md`: the official framework skills to load before building.
- Expo SDK 58 docs: values prefixed `EXPO_PUBLIC_` are inlined into the app bundle and readable by users, which is why R18 keeps keys on the server.
- Supabase docs: Row Level Security policies written as `(select auth.uid()) = user_id`, with an index on the filtered column. Edge Functions use `withSupabase({ auth: 'user' })` to get a client scoped to the caller.
- Apple App Store Review Guidelines 5.1.1(v): apps that support account creation must offer in-app account deletion, which R4 covers.
- FTC Safeguards Rule (16 CFR 314): may cover fintech apps that handle customer financial data. Not yet confirmed for this app.

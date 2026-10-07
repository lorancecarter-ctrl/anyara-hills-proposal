# Anyara Hills — Sales Proposal (iPad app)

An installable web app (PWA) for the Anyara Hills sales gallery. It runs fullscreen from the iPad
home screen, works with no internet connection once installed, and keeps each visit's data on the
iPad only — nothing is sent anywhere.

## Backend setup (Supabase)

Pricing lives in Supabase so an admin can update it without a developer. Until `config.js` is
filled in the app runs standalone, with the device-local sign-in described further down — so it
keeps working while you set this up.

**1. Create the project.** At [supabase.com](https://supabase.com), create a project. Note the
region — pick Singapore for Malaysian users.

**2. Run the schema.** SQL Editor → New query → paste all of `supabase/schema.sql` → Run. It creates
the `lots`, `profiles` and `price_imports` tables, the Row Level Security policies, and the trigger
that gives every new auth user a profile. Re-running it is safe.

**3. Turn off public sign-ups.** Authentication → Sign In / Providers → uncheck *Allow new users to
sign up*. Accounts are created by you, not by whoever finds the URL.

**4. Create your own account and promote it.** Authentication → Users → Add user (email + password).
Then in the SQL Editor:

```sql
update public.profiles set role = 'admin', must_change_password = false
where email = 'you@khkland.com';
```

**5. Connect the app.** Project Settings → Data API. Copy the URL and the **anon / public** key into
`config.js`. Never put the `service_role` key there — it bypasses every policy and this file is
served to browsers and committed to the repo.

**6. Add the advisors.** Authentication → Users → Add user, one per advisor, with a starter password.
They stay role `advisor` (read-only) and are forced to choose their own password at first sign-in.
To revoke someone, delete them under Authentication → Users — they lose access on every device.

### Who can do what

| | Read pricing | Edit pricing |
|---|---|---|
| Not signed in | No | No |
| `advisor` | Yes | No |
| `admin` | Yes | Yes |

Reading requires a login **by design**. The anon key ships inside the app and this repo is public, so
anonymous read would publish your price list to anyone who found the key.

### The admin console

Open `/admin/` (e.g. `http://localhost:8080/admin/`) and sign in with your admin account.

- **Upload the price list** — drag in an `.xlsx`, `.xls` or `.csv`. The parser finds the heading row
  even with title rows above it, accepts common column aliases (`Lot`, `Lot Number`, `Size (SF)`,
  `Price (RM)`, `Entitlement`…), and strips `RM` and thousands separators.
- **Review before anything is written.** You get a summary (new / changed / unchanged / skipped),
  a row-by-row preview marking each lot New or Updated, and a list of any rows it had to reject and
  why. Nothing is saved until you press Publish.
- **Publishing never deletes.** Lots absent from the file are left untouched and called out in the
  preview. To take a lot off the list, set its status to `Sold` rather than removing the row.
- **Nett price and psf are computed by the database**, so the admin console, the app and the
  proposal can never disagree. Don't put them in the spreadsheet.
- Every import is logged with the filename, counts and who ran it.

Lot numbers keep their exact form — `036` and `203A` survive both CSV and Excel without losing
leading zeros.

A starting file is at `docs/pricing-template.csv`.

### On the iPads

Advisors get a **Choose a lot** dropdown in the builder that fills in size, list price and privilege.
Typing figures by hand still works for anything not on the list. The price list is cached on each
iPad after sign-in, so the gallery keeps working with the Wi-Fi off; when it's serving from cache the
builder says so, with the date it last synced.

## Signing in

The app opens on a sign-in screen, which works one of two ways depending on whether `config.js` is
filled in.

**With Supabase connected (recommended).** Advisors sign in with the email and starter password you
created for them in the dashboard, and are forced to choose their own before the app opens. One
account works on every iPad, and deleting the user revokes access everywhere.

**Standalone, before Supabase is set up.** Accounts are created on the device itself. The default
password is **`1234`**, and the app immediately forces a change.

- First sign-in on a given iPad with `1234` creates the account on that device and goes straight to
  "Choose a password". The new password must be at least 8 characters and cannot be the default.
- After that, only the new password works. `1234` is rejected.
- The session persists across reloads and app restarts. **Session → Sign out** ends it.
- Reloading mid-flow does not skip the forced change — an account still on the default always
  lands back on the change screen.

### What the standalone mode is and isn't

Everything below applies **only when Supabase is not connected**. With Supabase, accounts are real
server-side accounts and none of these caveats hold.

This is a **workflow gate, not security.** There is no server: accounts live in each iPad's
`localStorage`. That means:

- **Accounts are per-device.** An advisor who signs in on iPad A has no account on iPad B — they'd
  sign in there with `1234` again and set a password for that device. There is no central user list.
- **Any email address works** for a first sign-in on a fresh device, because nothing can check it
  against a directory.
- **Anyone with the unlocked iPad and a browser debugger can read the stored data**, including the
  visit notes and pricing. The gate stops a guest picking up an unattended iPad mid-viewing; it does
  not protect the pricing data from someone determined.
- **A forgotten password cannot be recovered** — there's no reset email. Clear the app's site data
  (or Safari → Clear History and Website Data) and the advisor signs in with `1234` again. That also
  clears any saved visit.

Passwords are never stored in the clear. On HTTPS or localhost the app uses PBKDF2-SHA256 at 150,000
iterations via WebCrypto; on a plain-http LAN address, where `crypto.subtle` is unavailable, it falls
back to a salted SHA-256 iterated 5,000 times. Both store only a salt and a hash.

If you ever need real access control — a central user list, revoking one person, or an audit trail of
who quoted what — that needs a backend, and it's a different piece of work.

## What's in it

**Pitch flow** — presented left to right from the nav rail:

| # | Section | Covers |
|---|---------|--------|
| — | Cover | Logo, positioning line, and the guest's name once the visit is set up |
| 01 | Estate | 584 acres, 428 lots, 70% green, 8 lakes, the Anyar + Ara story, Founders Circle |
| 02 | Location | 20–25 min to KLCC, the 4.2 km bypass road, nearby healthcare / education / recreation / retail |
| 03 | Land | Freehold agricultural individual title, the 20% / 8,712 sf buildable rule, infrastructure |
| 04 | Security | 12 ft wall, 200+ CCTV, drone patrol, GDSS credentials |
| 05 | Lifestyle | The 10-acre hub, exclusive vs shared facilities, bespoke services |
| 06 | Ownership | Maintenance, operator charge, quit rent, completion, architect subsidy |

**Advisor tools:**

- **Talk** — the 30 luxury conversation questions by stage, tappable to track what you've asked,
  plus the expander prompts and a notes field for the visit.
- **Build** — enter the lot, size and pricing; nett price, psf, loan quantum, down payment and the
  monthly instalment are calculated. Privileges and validity are editable.
- **Proposal** — the finished client-facing document, matching the Sales Package Proposal template.
  "Print / Save as PDF" prints the document alone on A4, with no app chrome.
- **FAQ** — the full project FAQ, searchable, plus the Q&A responses from the etiquette guide.

## Running it

```bash
node server.js
```

Then open `http://localhost:8080`. No dependencies and no build step — it is plain HTML, CSS and JS.

## Putting it on the iPads

The iPads need to reach the app over the gallery network once, to install it. After that it runs offline.

1. **Serve it on a machine on the same Wi-Fi.** Run `node server.js` on a laptop in the gallery, then
   find that laptop's LAN address (`ipconfig` on Windows) — e.g. `http://192.168.1.42:8080`.
2. On the iPad, open that address **in Safari** (not Chrome — only Safari can install to the home screen).
3. Tap **Share → Add to Home Screen**, name it *Anyara Hills*, tap Add.
4. Open it from the home screen. It launches fullscreen with no browser bar and works with Wi-Fi off.

For a permanent setup, host the folder on any static host (Netlify, Cloudflare Pages, Vercel, or your
own web server) over **HTTPS** — service workers only run on HTTPS or localhost, so offline mode needs
a real certificate once it is off the local network.

### Updating the app

After changing any file, bump `CACHE` in `sw.js` (`anyara-v1` → `anyara-v2`). Otherwise installed iPads
keep serving the old cached build. Reopening the app twice picks up the new version.

## Verified figures

The pricing maths was checked against the worked example in the Sales Package Proposal template
(Lot 036, 43,953 sf, list RM 6,043,750, privilege RM 1,808,750):

| Output | App | Template |
|--------|-----|----------|
| Nett SPA price | RM 4,235,000 | RM 4,235,000 |
| Nett price psf | RM 96 psf | RM 96 psf |
| Loan quantum (60%) | RM 2,541,000 | RM 2,541,000 |
| Down payment (40%) | RM 1,694,000 | RM 1,694,000 |
| Monthly instalment (3.5%, 30 yr) | RM 11,410 | RM 11,410 |

Instalments use the standard amortising formula, `P·r / (1 − (1+r)^−n)`, with a monthly rest.

**One discrepancy to resolve:** the template states Lot 036 as *1.609 acres | 43,953 sf*. Those
disagree — 43,953 sf is **1.009** acres (43,560 sf to the acre). The app derives acres from the square
footage, so it shows 1.009. Confirm which figure is correct before this goes to a client.

## Where the content came from

| Source document | Used for |
|-----------------|----------|
| `Anyara Hills - FAQ - as at 2026.07.07.pdf` | The FAQ section and most project facts |
| `Anyara_Hills_Sales_Journey_Gallery_Etiquette_Guide.pdf` | Key facts cheat sheet, the in-room Q&A responses |
| `Anyara Hills Luxury Question V1.pdf` | The 30 conversation questions and expanders |
| `Anyara_Hills_Sales_Package_Proposal_Redesigned.docx` | The proposal document structure, privileges and worked example |
| `Anyara Hills_Simplified brochure.pdf` (brand guidelines) | Hillside Green `#0c2316`, Estate Ivory `#f4f3eb`, Instrument Serif + Inter |
| `260713_SNP_Anyara Hills.pdf` | The Fifth Schedule payment stages, in the FAQ |
| `anyara_hills_logo_black.png` | Logo and the generated app icons |

## Notes and limits

- **No photography.** The source folder had only the logo and watermark — no renders, masterplan or
  lifestyle imagery. The app is typographic by design, but hero images and a masterplan would lift
  the pitch sections considerably. Drop them into `assets/` and they can be wired in.
- **The clubhouse video** (`AnyaraV2 Clubhouse 03 With HotSpring.mp4`, 459 MB) is not bundled — it
  would exceed what is sensible to cache offline. It can be added, ideally compressed first.
- **Package figures change.** The builder deliberately takes the privilege entitlement, rate and
  margin of finance as inputs rather than hard-coding them, and the screen carries the etiquette
  guide's warning to confirm current figures with the sales manager before quoting.
- Visit data lives in `localStorage` on each iPad. "Start a new visit" in the Session panel clears it.
- The sign-in gate is device-local and is not a security boundary — see **Signing in** above for what
  it does and does not protect.

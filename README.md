# Anyara Hills — Sales Proposal (iPad app)

An installable web app (PWA) for the Anyara Hills sales gallery. It runs fullscreen from the iPad
home screen, works with no internet connection once installed, and keeps each visit's data on the
iPad only — nothing is sent anywhere.

## Backend (Supabase) — connected

Project `onnzgykuumuvfsnestrc` (region ap-southeast-2). The schema is applied and `config.js` is
wired to it, so the app talks to the live database already.

Done:

- `lots`, `profiles` and `price_imports` tables, with Row Level Security.
- The trigger that gives every new auth user a profile.
- `config.js` pointing at the project with the publishable key.
- Function hardening — `search_path` pinned, and the helper functions no longer exposed over REST
  to anonymous callers.

### Remaining, and only you can do these

**1. Create your admin account.** Dashboard → Authentication → Users → **Add user**, with your email
and a password. Then SQL Editor:

```sql
update public.profiles set role = 'admin', must_change_password = false
where email = 'you@khkland.com';
```

**2. Turn off public sign-ups.** Authentication → Sign In / Providers → uncheck *Allow new users to
sign up*. Otherwise anyone who finds the URL can create themselves an advisor account and read the
price list.

**3. Turn on leaked-password protection.** Authentication → Policies → enable the HaveIBeenPwned
check. Supabase's own linter flags this as off.

**4. Add the advisors.** Authentication → Users → Add user, one per advisor, with a starter password.
They stay role `advisor` (read-only) and must choose their own password at first sign-in. To revoke
someone, delete them under Authentication → Users — they lose access on every device at once.

### Is it safe that `config.js` is in a public repo?

Yes, and this was tested rather than assumed. The publishable key identifies the project; it grants
nothing on its own. With a row present in `lots`, an anonymous request returns an empty array:

```
curl "https://onnzgykuumuvfsnestrc.supabase.co/rest/v1/lots?select=*" -H "apikey: <publishable key>"
→ []            # the row exists, RLS hides it
```

An anonymous insert is refused outright with `42501 new row violates row-level security policy`.
Both the publishable key and the legacy anon key behave the same way.

The **`service_role`** key is the dangerous one — it bypasses every policy. It is not in this repo
and must never be put in `config.js`.

### Changing the Supabase settings later

`config.js` is cached by the service worker, so after editing it bump `CACHE` in `sw.js` or the
iPads will keep using the old connection details.

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

- **Upload the price list** — drag in an `.xlsx`, `.xls` or `.csv`. Pick the sheet if the workbook
  has more than one. The parser finds the heading row even with title rows above it, accepts common
  column aliases, and strips `RM` and thousands separators.
- **Check the column mapping.** This is the step that matters. The console shows which spreadsheet
  column feeds each field, as a set of dropdowns you can change. It auto-detects, but you confirm.
- **Review before anything is written.** You get a summary (new / changed / unchanged / skipped),
  a row-by-row preview marking each lot New or Updated, and a list of any rows it had to reject and
  why. Nothing is saved until you press Publish.
- **Publishing never deletes.** Lots absent from the file are left untouched and called out in the
  preview. To take a lot off the list, set its status to `Sold` rather than removing the row.
- **Nett price and psf are computed by the database**, so the admin console, the app and the
  proposal can never disagree. Don't put them in the spreadsheet.
- Every import is logged with the filename, counts and who ran it.

Lot numbers keep their exact form — `001` and `003A` survive both CSV and Excel without losing
leading zeros.

A starting file is at `docs/pricing-template.csv`.

### Why the column mapping is not automatic

The master price list (*Pricing Revision V12B*) carries **two sets of prices side by side** — the
superseded ones and the revised ones — under identical headings:

| | F | G | H | I | **J** | K | **L** | M |
|---|---|---|---|---|---|---|---|---|
| | LIST PRICE | LIST PSF | CURRENT SPA PRICE | CURRENT SPA PSF | **LIST PRICE** | LIST PSF | **SPA PRICE** | SPA PSF |
| | *superseded* | | *superseded* | | **revised** | | **revised** | |

A parser that simply took the first matching heading would publish the **superseded** prices. So the
rules are: for a duplicated heading take the **rightmost** column (a revision puts new prices to the
right), and never match a heading containing *current*. Those rules get this file right — but they
are a heuristic, so the console always shows what it chose and says when a heading was ambiguous.
**Check the mapping before you publish.**

### How the fields are derived

- **Privilege** is not a column in the master sheet. It is computed as `list price − SPA price`.
  If your sheet states a discount directly instead, map it to Privilege and leave SPA unmapped.
- **Nett price** and **psf** are generated by the database from list and privilege.
- A lot with an **SPA price but no list price** is treated as undiscounted, with the nett price used
  as the list price. Phase 4a is like this — the revision did not reprice it. The import summary
  says how many rows this applied to.
- Rows below the table with text but no figures (totals, signatory blocks) are ignored silently.

### Verified against the master list

Parsing *(Approved) Anyara Hills — Pricing Revision V12B*:

| | |
|---|---|
| Lots parsed | **338 of 338**, zero rejected |
| By phase | 224 Phase 1 & 2 · 104 Phase 3 · 10 Phase 4a |
| By status | 197 Available · 122 Sold · 19 Booked |
| Spot checks | Lot 001 → RM 9,613,750 list, RM 7,691,000 SPA, RM 150 psf · Lot 217 → RM 10,546,250 / RM 8,437,000 / RM 180 psf · Lot 800 → RM 10,045,000, no privilege, RM 200 psf |

**Never commit a real price list to this repo** — it is public. `.gitignore` blocks `*.xlsx` and
`*.xls` for that reason.

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

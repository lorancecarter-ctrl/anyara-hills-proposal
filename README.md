# Anyara Hills — Sales Proposal (iPad app)

An installable web app (PWA) for the Anyara Hills sales gallery. It runs fullscreen from the iPad
home screen, works with no internet connection once installed, and keeps each visit's data on the
iPad only — nothing is sent anywhere.

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

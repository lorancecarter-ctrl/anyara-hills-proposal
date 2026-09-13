/* Anyara Hills — content extracted from the project source documents.
   Sources: Project FAQ (as at July 2026), Sales Journey / Gallery & Etiquette Guide,
   Luxury Conversation Questions V1, Sales Package Proposal template. */

const SCENES = [
  { id: 'cover',      label: 'Cover',     num: ''   },
  { id: 'estate',     label: 'Estate',    num: '01' },
  { id: 'location',   label: 'Location',  num: '02' },
  { id: 'land',       label: 'Land',      num: '03' },
  { id: 'security',   label: 'Security',  num: '04' },
  { id: 'lifestyle',  label: 'Lifestyle', num: '05' },
  { id: 'ownership',  label: 'Ownership', num: '06' },
  { id: 'discovery',  label: 'Talk',      num: '',  tool: true },
  { id: 'builder',    label: 'Build',     num: '',  tool: true },
  { id: 'proposal',   label: 'Proposal',  num: '',  tool: true },
  { id: 'faq',        label: 'FAQ',       num: '',  tool: true }
];

/* ---- Luxury Conversation Questions ---- */
const DISCOVERY = [
  { stage: 'Openers', hint: 'Start every question naturally.', qs: [
    "I'd love to get to know you a little better before I show you more of Anyara Hills. What do you usually enjoy doing on weekends?",
    "Before I share more about Anyara Hills, may I ask you something?",
    "Just out of curiosity — what was the very first thing that caught your attention when you arrived today?",
    "If you don't mind me asking, where do you usually go when you want to relax?",
    "Everyone enjoys life differently. What does your ideal weekend usually look like?",
    "I've always been curious — after achieving success, what do you value most in a home today?"
  ]},
  { stage: '1 — First impression', hint: '', qs: [
    "What was the first thing you noticed when you arrived here?",
    "How does this place feel compared to the city?",
    "If you described this place in three words, what would they be?",
    "Does this place remind you of somewhere you've visited before?"
  ]},
  { stage: '2 — Lifestyle', hint: 'Then: “Based on what you enjoy, I’d love to show you a few places in Anyara Hills I think you’ll really appreciate.”', qs: [
    "Are you someone who enjoys a quiet coffee with a beautiful view, or do you prefer outdoor activities?",
    "Where do you normally go when you want to relax?",
    "If you had one free day every week, how would you spend it?",
    "Is peace and quiet more important to you now than before?",
    "What does a good quality of life mean to you?"
  ]},
  { stage: '3 — Future vision', hint: '', qs: [
    "Can you imagine living here? What would your mornings be like?",
    "What kind of memories would you like your family to create here?",
    "If you built your dream home here, what is the one thing you must have?",
    "If you invited your family and friends here, what would you like them to feel?"
  ]},
  { stage: '4 — Personal values', hint: '', qs: [
    "What does success mean to you today?",
    "At this stage of your life, what do you value the most?",
    "What kind of place helps you relax and think clearly?"
  ]},
  { stage: '5 — Lifestyle & legacy', hint: '', qs: [
    "What makes a neighbourhood special to you?",
    "Today, what is more important to you: location, lifestyle or legacy?",
    "How important is privacy to you and your family?",
    "What kind of legacy would you like to leave for your children?"
  ]},
  { stage: '6 — Reflection', hint: '', qs: [
    "What surprised you the most during today's visit?",
    "If you owned a home here, how do you think your lifestyle would change?",
    "What would make a place like this the right home for your family?",
    "Is there anything else you would like to know about Anyara Hills?"
  ]},
  { stage: 'Bonus', hint: '', qs: [
    "What do you enjoy most about your current home?",
    "If you could change one thing about your current home, what would it be?",
    "What kind of home do you hope your children will remember one day?",
    "What is your favourite place to spend time with your family?",
    "What is your idea of a perfect home?",
    "When you think about your future, can you picture your family living in a place like this?"
  ]}
];

/* ---- Q&A: realistic guest questions, non-committal responses (Etiquette Guide, Ch. 8) ---- */
const QA = [
  ["“If we're interested today, how soon can we move forward?”",
   "“I can walk you through the reservation and SPA process now, and our team will guide you step by step from there.”"],
  ["“Can we choose which lot faces the lake or the mountain?”",
   "“Lot allocation depends on what's currently available — let me check the live masterplan with you.”"],
  ["“Is there flexibility in the payment schedule?”",
   "“Yes, and I'll connect you with our financing partners so you have exact, current numbers.”"],
  ["“What if we want to build later, not right away?”",
   "“That's entirely your pace. I can share current construction incentives when you're ready.”"],
  ["“How long before we could actually move in?”",
   "“That depends on the lot and build plan — let me get you the current vacant possession timeline.”"]
];

/* ---- Project FAQ, as at July 2026 ---- */
const FAQ = [
  { cat: 'Location', q: 'Where is the project located?',
    a: 'Jalan Sungai Lalang, Semenyih (Sungai Long East).' },
  { cat: 'Location', q: 'How far is Anyara Hills from KLCC?',
    a: 'Approximately 20–25 minutes via the New Bypass access road, SILK Highway and EKVE — about 30 km.' },
  { cat: 'Location', q: 'Where is the New Bypass road located?',
    a: 'The interchange from the SILK Highway to the New Bypass Road is after the Sungai Long toll, near the Twin Palm project when coming from the Cheras direction.' },
  { cat: 'Location', q: 'What is the length of the new bypass road?',
    a: 'Approximately 4.2 km.' },
  { cat: 'Location', q: 'Who is constructing the New Bypass road?',
    a: 'It has been approved by the authorities and construction will be undertaken by our Group.' },
  { cat: 'Location', q: 'When is the bypass road estimated for completion?',
    a: 'Estimated by end of 2027.' },

  { cat: 'Masterplan', q: 'What is the land tenure and type?',
    a: 'Freehold, agricultural land, individual title.' },
  { cat: 'Masterplan', q: 'What is the total land size?',
    a: '584 acres.' },
  { cat: 'Masterplan', q: 'How many lots are there?',
    a: '428 lots in total. Phase 1 comprises 238 lots.' },
  { cat: 'Masterplan', q: 'What is the restriction on the land title?',
    a: 'Under the National Land Code, an agricultural title allows owners to build up to 20% of the land footprint — 43,560 sf × 20% = 8,712 sf.' },
  { cat: 'Masterplan', q: 'What infrastructure is provided?',
    a: 'Electricity: ready for connection from the feeder pillar — the purchaser applies to TNB for connection and meter. Water: ready for connection — apply to Air Selangor for the meter. Sewerage: purchaser installs their own septic tank. Roads and drains: constructed by the Developer. Street and garden lighting around the parkways and jogging paths: installed by the Developer.' },
  { cat: 'Masterplan', q: 'What is the electricity supply capacity?',
    a: 'Owners can apply for up to 100A 3-phase, according to usage.' },
  { cat: 'Masterplan', q: 'Has any soil treatment been carried out?',
    a: 'No.' },
  { cat: 'Masterplan', q: 'How much landscape and waterbody is there?',
    a: 'Anyara Hills has 35 acres of open spaces and waterbodies.' },

  { cat: 'Maintenance & security', q: 'What is included in the maintenance charges?',
    a: 'Landscape services in common areas; maintenance of roads, drainage, street lighting, the lake and perimeter wall; and security services including armed guards and CCTV.' },
  { cat: 'Maintenance & security', q: 'Who is the security consultant?',
    a: 'GDSS Systems Sdn Bhd. Their lead consultant, Richard Dimmick, advises on physical building design and security for Sungai Buloh and Tapah prisons. GDSS consulted on Malaysia’s first gated community, Sierramas, and on many Desa Park City projects, and has twice been appointed to upgrade KLCC car park and common area security.' },
  { cat: 'Maintenance & security', q: 'What are the security features?',
    a: 'Armed guards at the main entrance; 24-hour patrolling guards; a 12-foot high double security wall with electric fencing; more than 200 CCTVs; an autonomous drone patrolling system; an individual guardhouse for each phase (3 sub-guardhouses); and a visitor management system.' },
  { cat: 'Maintenance & security', q: 'How much is the maintenance fee?',
    a: 'Approximately RM 0.046 psf, calculated on lot size, plus operator charges of approximately RM 500 per month for The Anyara Lifestyle Hub. Both are payable monthly by the purchaser to the Developer.' },

  { cat: 'Lifestyle Hub', q: 'What is The Anyara Lifestyle Hub?',
    a: 'A 10-acre commercial lifestyle hub offering a restaurant and café, residents’ lounge, events hall, natural hot spring spa, gym, pool and children’s playground.' },
  { cat: 'Lifestyle Hub', q: 'Is the Hub open to the public?',
    a: 'The restaurant, wellness centre and event hall are open to the public. The residents’ lounge is exclusive to residents.' },
  { cat: 'Lifestyle Hub', q: 'Which facilities are exclusive to owners?',
    a: 'Exclusive: residents’ lounge, meeting room, games room, reading room. Non-exclusive: swimming pool, kids’ pool, gym, children’s playground.' },
  { cat: 'Lifestyle Hub', q: 'When will the Hub be completed?',
    a: 'Estimated by end of 2027.' },

  { cat: 'Amenities', q: 'What amenities are nearby?',
    a: 'Healthcare — KPJ Kajang Specialist Hospital, Sungai Long Specialist Hospital, Columbia Asia Hospital. Recreation — Kajang Hill Golf Club, Saujana Impian Golf Club, Broga Hill. Education — University of Nottingham Malaysia, UTAR Sungai Long, Tenby International School, Rafflesia International & Private School. Malls — Lotus’s Semenyih, EcoHill Walk, AEON Cheras Selatan.' },

  { cat: 'After sales', q: 'What after-sales services are provided?',
    a: 'The Developer can assist purchasers with the design, submission and construction of their dwelling; with the design, planting and maintenance of their farm or garden; and with housekeeping services (butler services as set out in the sales kit).' },
  { cat: 'After sales', q: 'Are there charges if the Developer assists with design and construction?',
    a: 'The Developer offers an Architect Subsidy Fee Programme of up to RM 40,000 where owners engage our panel architects.' },

  { cat: 'Ownership', q: 'What was the land previously used for?',
    a: 'Palm oil plantation.' },
  { cat: 'Ownership', q: 'Can the title be converted from Agricultural to Residential?',
    a: 'No. Owners are not allowed to convert the land title, as stated in the SPA.' },
  { cat: 'Ownership', q: 'How many names can a purchaser include in the SPA?',
    a: 'Per the National Land Code, limited to one acre per individual name, or held in a company name.' },
  { cat: 'Ownership', q: 'What is the quit rent and assessment?',
    a: 'The rate on agricultural land is much cheaper than residential. Currently less than RM 15,000 is paid across the full 584 acres.' },
  { cat: 'Ownership', q: 'When is completion and handover expected?',
    a: 'Expected completion is 24 or 36 months, as per the SPA.' },

  { cat: 'Payment', q: 'What is the SPA schedule of payments?',
    a: 'Fifth Schedule: 10% immediately upon signing. Then, within 30 days of the Vendor’s written notice of commencement of — site clearance and earthworks 15%; foundation 20%; structural framework 20%; walls with door and window frames in position 10%; roofing, electrical wiring, plumbing, gas piping and internal telecommunication trunking 5%; internal and external plastering 5%; septic tank, internal sewerage, internal drains and driveway works 5%. The balance 10% on the date the purchaser takes vacant possession with water and electricity ready for connection.' },
  { cat: 'Payment', q: 'What are the standard package highlights?',
    a: 'Free SPA legal fees; 10-year free maintenance fee; and a complimentary 6-seater electric buggy. Early bird and psf-linked discounts have applied at various times. All figures are subject to the terms in force at the time of sale — always confirm current figures with your sales manager before quoting a client.' }
];

/* ---- Default privileges, from the Sales Package Proposal template ---- */
const DEFAULT_PRIVILEGES = [
  { name: 'Legal Fees Waiver',   detail: 'SPA legal fees fully borne by developer', value: 'Complimentary' },
  { name: '10-Year Maintenance', detail: 'Maintenance fees waived for 10 years',    value: 'RM 30,000' },
  { name: '6-Seater Buggy Car',  detail: 'One unit provided per lot',                value: 'Complimentary' }
];

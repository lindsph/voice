import { existsSync, readFileSync } from "node:fs";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const LINDSAY_GUIDE = `# Lindsay — voice and tone

**What this is for:** DMs, follow-ups, LinkedIn notes, and later client updates.
**Not for:** WoolGrown, Alpha, or generic “virtual assistant” copy.

## Who this sounds like

A software developer with a long ops background who is taking on a bit of side work. Warm, direct, specific. Does not perform expertise. Does not sell a lifestyle.

**Signals:**

- Admin and organization *plus* the technical backend.
- Websites, tools, automations, listings, booking — the unglamorous stuff.
- Make the messy parts clearer, then actually build the thing.
- Side work. Small number of clients. No pressure either way.

## Voice rules

| Do | Don't |
|----|-------|
| Write like you already know them, if you do | Introduce yourself as a stranger when you are not |
| Name the real offer: ops + technical side | Let one listing/address fix become the whole job |
| Use a concrete thing you noticed as the reason you thought of them | Send a service menu or a teardown |
| Contractions, short paragraphs, one idea each | Brochure language, “synergy”, “scale your brand” |
| “Happy to look if useful — no pressure either way” | Hard close, fake urgency, “I’d love to pick your brain” |
| Lead with what you actually do | Lead with “virtual assistant” or “VA” |
| Keep current Lightspeed work in the background | Announce a career change |

### How sentences open and flow

- Open with a short hook. “Hey Charise — random one.” is on-brand. “Hope this message finds you well” is not.
- Conversational sentences. Vary length. Talk to “you”.
- One curiosity or observation, then the offer, then an easy out.

### Warmth

- Friendly, not bubbly-for-hire.
- At most one exclamation mark unless you are actually texting a friend.
- No emoji stacks. One is fine if it is already how you talk to that person.

### Claims

- Do not promise income, transformation, or “I’ll handle everything.”
- Specific help is fine: listings, site, booking, admin that piles up on the floor.
- If you do not know, say you will look and tell them what is worth doing.

## Gold examples

These already passed your ear. New copy should feel like them.
`;

const LINDSAY_SYSTEM = [
  "You write short notes in Lindsay’s voice.",
  "She is a software developer with a long ops background, taking on a small amount of side work for local small businesses.",
  "Sound like her, then tighter: warm, direct, specific.",
  "Never introduce her as a virtual assistant or VA. Never brochure or hard-sell.",
  "Facts may only come from the provided context. Do not invent tools, addresses, team size, software, or relationships.",
  "Gold examples are voice reference. Vary the opening. Do not paraphrase them wholesale.",
  "Approved tone learnings override golds when they conflict.",
].join(" ");

const WOOLGROWN_SYSTEM = [
  "You write WoolGrown Company drafts.",
  "Voice: practical Ontario maker — short paragraphs, answer first, humble about unproven claims.",
  "Canadian spelling where natural (centre, favour).",
  "Vary openings; treat gold examples and learnings as voice reference — do not paraphrase wholesale.",
  "Facts may only come from the provided context. Do not invent studies, numbers, or citations.",
].join(" ");

function lindsaySurfaces() {
  return [
    {
      id: "first_note",
      label: "First note",
      maxWords: 120,
      hint: "A first reach-out. One observation, then the offer, then an easy out.",
    },
    {
      id: "follow_up",
      label: "Follow-up",
      maxWords: 90,
      hint: "They asked what that means, or this is the second beat. Name the work. No second intro.",
    },
    {
      id: "in_person",
      label: "In person",
      maxWords: 50,
      hint: "A line she can say on the floor. One noticed thing, one offer.",
    },
    {
      id: "scope",
      label: "Scope / email",
      maxWords: 220,
      hint: "A short scope after they are already talking. Specific, not a brochure.",
    },
    {
      id: "other",
      label: "Other writing",
      maxWords: null,
      hint: "About, LinkedIn, or a later update. Same voice. Length is open.",
    },
  ];
}

function woolgrownSurfaces() {
  return [
    {
      id: "blog",
      label: "Blog",
      maxWords: null,
      hint: "Shop blog draft. Lead, then sections, then a short FAQ, then one soft CTA. No Comment/DM language.",
    },
    {
      id: "shop_faq",
      label: "Shop FAQ",
      maxWords: 120,
      hint: "A short shop FAQ answer. Plain language. Do not invent claims.",
    },
    {
      id: "social",
      label: "Social",
      maxWords: 80,
      hint: "A caption. Short. Field-specific. CTA only if there is a real next step.",
    },
  ];
}

async function main() {
  const woolgrownGuide = existsSync("/Volumes/dev/personal/alpha/config/content/woolgrown-tone.md")
    ? readFileSync("/Volumes/dev/personal/alpha/config/content/woolgrown-tone.md", "utf8")
    : "# WoolGrown — voice and tone\n\n## Who we sound like\n\nA practical Ontario grower-maker.\n";

  await prisma.profile.upsert({
    where: { id: "lindsay" },
    update: {},
    create: {
      id: "lindsay",
      name: "Lindsay",
      description: "Side-work reach-outs. Ops plus the technical side. Not a VA.",
      guide: LINDSAY_GUIDE,
      systemPrompt: LINDSAY_SYSTEM,
      bannedForPrompt: JSON.stringify([
        "virtual assistant / VA as the identity",
        "I'd love to pick your brain",
        "synergy, 10x, guaranteed, limited time",
        "scale your brand / scale your business",
        "holistic solutions, full-service, transform your, unleash",
        "hope this email/message finds you well",
      ]),
      surfaces: JSON.stringify(lindsaySurfaces()),
    },
  });

  await prisma.profile.upsert({
    where: { id: "woolgrown" },
    update: {},
    create: {
      id: "woolgrown",
      name: "WoolGrown",
      description: "Ontario grower-maker. Garden wool. Humble about unproven claims.",
      guide: woolgrownGuide,
      systemPrompt: WOOLGROWN_SYSTEM,
      bannedForPrompt: JSON.stringify([
        "guaranteed / guarantee",
        "kills all slugs / pest-proof / weed-proof",
        "AI-generated / as an AI",
        "In today's world",
        "delve",
      ]),
      surfaces: JSON.stringify(woolgrownSurfaces()),
    },
  });

  const golds = [
    {
      id: "lindsay-about",
      profileId: "lindsay",
      title: "LinkedIn About closer",
      body: "I'm also taking on a bit of side work with small businesses — the admin and organization side, plus the technical stuff: websites, tools, automations. Same instincts as the rest of it: make the messy parts clearer, then actually build the thing.",
      source: "Seeded from LinkedIn About.",
      surface: "other",
    },
    {
      id: "lindsay-charise",
      profileId: "lindsay",
      title: "Charise Instagram note",
      body: "Hey Charise — random one. I’ve started taking on a bit of side work helping small businesses with ops and the technical side: admin, the website, booking, listings, automations — the stuff that sits next to the actual work when you’re also on the floor. Noticed a couple of listings still have you at the King Street address and it made me think you might want a hand with that kind of thing. Happy to look if useful — no pressure either way.",
      source: "Seeded from the approved Charise note.",
      surface: "first_note",
    },
    {
      id: "lindsay-follow",
      profileId: "lindsay",
      title: "If they ask what that means",
      body: "Like: keep Google and the site accurate, make booking less annoying, tidy the website, set up the little automations so reminders and hiring and follow-up aren’t living in your head. I can take a look and tell you what’s worth doing.",
      source: "Seeded from the approved follow-up.",
      surface: "follow_up",
    },
    {
      id: "woolgrown-maker",
      profileId: "woolgrown",
      title: "About the maker",
      body: "Hi! I’m Lindsey, the founder of WoolGrown — a proudly Canadian company turning locally grown wool into natural, biodegradable fabrics and materials for gardening, landscaping and agriculture.",
      source: "Seeded from woolgrown-tone.md.",
      surface: "blog",
    },
    {
      id: "woolgrown-howto",
      profileId: "woolgrown",
      title: "How-to (Why → What → How)",
      body: "Wire planters and hanging baskets dry out fast. Lining them with loose wool holds moisture without waterlogging roots. Tuck a layer inside your basket before adding soil.",
      source: "Seeded from woolgrown-tone.md.",
      surface: "blog",
    },
    {
      id: "woolgrown-uncertainty",
      profileId: "woolgrown",
      title: "Uncertainty",
      body: "Gardeners often report fewer slug visits on wool mulch or pellets. Controlled studies are still thin, so treat pest benefits as a possible bonus — not the main reason to use wool.",
      source: "Seeded from woolgrown-tone.md.",
      surface: "blog",
    },
  ];

  for (const gold of golds) {
    await prisma.gold.upsert({
      where: { id: gold.id },
      update: {},
      create: { ...gold, canonical: true, status: "active", createdAt: new Date() },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

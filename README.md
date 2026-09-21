# Voice

The teacher. lindsay-assistant and WoolGrown are the mouths.

Work on tone, golds, and learnings here. Apps call this service when they draft.

```bash
nvm use
npm install
node scripts/provision-neon-db.mjs   # once — creates the `voice` Neon database
npx prisma db push
npx prisma db seed
npm run dev
```

Open [http://127.0.0.1:3030](http://127.0.0.1:3030).

## Apps

```
VOICE_URL=http://127.0.0.1:3030
VOICE_PROFILE=lindsay   # or woolgrown
VOICE_API_SECRET=
```

- `GET /api/profiles/:id/bundle?surface=&seed=`
- `POST /api/profiles/:id/generate` `{ surface, facts, seed? }`
- `POST /api/profiles/:id/learn` `{ before, after, why?, rule?, keepAsGold? }`

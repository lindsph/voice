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
VOICE_TEACH=on          # per-integration lever (see below)
```

**Teach switch** — each app decides whether *this host* may write learnings:

| Integration | Default | Local | Production |
|---|---|---|---|
| lindsay-assistant | `always` | teaches | teaches |
| WoolGrown | `production` | silent | teaches |

`VOICE_TEACH=on|off` pulls the lever either way. Local WoolGrown pad fiddling does not train Voice unless you set `VOICE_TEACH=on`. That is separate from `WOOLGROWN_EDITOR_TEACH`, which only writes WoolGrown’s local `ToneLearningRow`.

- `GET /api/profiles/:id/bundle?surface=&seed=`
- `POST /api/profiles/:id/generate` `{ surface, facts, seed? }`
- `POST /api/profiles/:id/learn` `{ before, after, why?, rule?, keepAsGold? }`

## Production

Voice is its own Fly app (`lindsay-voice`) and Neon `voice` database. It does **not** ship inside `woolgrown-command`. Command only talks to it when `VOICE_URL` is set.

Deploy the pair from either repo (Voice first if this checkout changed, then Command):

```bash
# from Voice
./scripts/fly-deploy-pair.sh

# from WoolGrown / Alpha
./scripts/fly-deploy.sh
```

Do not run bare `fly deploy` in Alpha if Voice also changed — that misses this app.


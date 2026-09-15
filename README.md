# Verba

**Your professional representative for recruiter screening calls.**

Cherry is the representative. She speaks with recruiters during 3–15 minute qualification screens, using your resume, preferences, and voice. She is not an interview coach, teleprompter, or note-taker.

Phone number and call forwarding are placeholders. Everything else is real.

## What you need

- Node 20+
- Python 3.11+
- Docker Desktop
- Free keys: [Groq](https://console.groq.com/keys) and [Google AI Studio](https://aistudio.google.com/api-keys)

Copy `.env.example` to `.env` and fill the keys. `.env` is gitignored.

## Run locally

```powershell
docker compose up -d
cd apps/web
npm install
npx prisma generate
npx prisma db push
npm run dev
```

In a second terminal:

```powershell
cd apps/agent
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e .
python agent.py dev
```

Open [http://localhost:3000](http://localhost:3000). Create an account, upload a resume, record 3 voice passages, then open **Cherry** to listen to your intro and talk live.

## Product flow

1. **Profile** — resume parse + facts Cherry may state
2. **Voice studio** — 3 casual ~1-minute passages (record / stop / rehear / train)
3. **Preferred answers** — salary, why looking, sponsorship, etc.
4. **Activate** — placeholder phone; browser screens are live
5. **Edit Cherry** — hear recordings, test call, simulated screen, retrain
6. **Call inbox** — summary, transcript, interest, human-likeness eval score

## Eval harness

Scores Cherry turns for AI-isms, overlong answers, and identity leaks. Wired into every saved call (`evalJson`) and runnable offline:

```powershell
npm run eval:corpus
```

Or:

```powershell
apps\agent\.venv\Scripts\python.exe packages\corpus\eval_corpus.py
```

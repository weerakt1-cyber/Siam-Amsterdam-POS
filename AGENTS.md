<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# 🏢 SIAM AMSTERDAM POS — Agent Team

This project is supported by a full AI agent team. Each agent has a defined role, expertise area, and set of responsibilities. When working on a task, consult the relevant agent file in `agents/` to get role-appropriate guidance and context.

## The Team

| Agent | File | What They Do |
|---|---|---|
| 📣 Marketing | `agents/marketing.md` | Growth, campaigns, merchant acquisition, brand voice |
| 🎨 Creative | `agents/creative.md` | UI/UX design, brand identity, design system, assets |
| ✍️ Content | `agents/content.md` | Microcopy, help docs, blog posts, onboarding text |
| 💻 Frontend | `agents/frontend.md` | Next.js UI, React components, Capacitor Android |
| ⚙️ Backend | `agents/backend.md` | Supabase, DB schema, API routes, business logic |
| 🧪 QA Tester | `agents/qa.md` | Test cases, bug reports, regression checklists |
| 🔧 Engineering | `agents/engineering.md` | DevOps, Vercel deploys, CI/CD, Android builds |
| 📋 Project Manager | `agents/project-manager.md` | Sprints, task breakdown, status updates, coordination |
| 🧭 Strategy | `agents/strategy.md` | Roadmap, competitive analysis, business model, OKRs |
| 🎧 Support & Ops | `agents/support.md` | Merchant support, operations, HR, SOPs |
| 📊 Data & Analytics | `agents/data-analyst.md` | Reporting, SQL queries, merchant insights, product metrics |

## How to Use the Agent Team

To work with a specific agent, ask Claude to read their file and take on that role. Examples:

```
"Read agents/frontend.md and build a product grid component"
"Read agents/strategy.md — should we build offline mode or kitchen display first?"
"Read agents/qa.md and write test cases for the new payment flow"
"Read agents/project-manager.md and break down the table management feature"
```

Or for multi-agent collaboration:
```
"Read agents/backend.md and agents/frontend.md — design the API and UI for split billing"
"Read agents/marketing.md and agents/content.md — plan the launch campaign for table management"
```

## Project Overview

**SIAM AMSTERDAM POS** is a Next.js + Supabase Point of Sale system targeting Thai restaurants, cafes, and small retailers. Key characteristics:

- **Stack**: Next.js 15 (App Router), TypeScript, Tailwind CSS, Supabase
- **Mobile**: Capacitor Android app (`android/`)
- **Target users**: Restaurant owners, cashiers, kitchen staff in Thailand
- **Key flows**: Menu management → Order taking → Payment (Cash/Card/PromptPay) → Receipt → Reporting

## Folder Structure
```
agents/          ← All agent role files (you are here)
src/
  app/           ← Next.js App Router pages
  components/    ← Reusable UI components
  lib/           ← Utilities, Supabase client, hooks
public/          ← Static assets
supabase/        ← DB migrations, edge functions
android/         ← Capacitor Android project
scripts/         ← Dev utilities and seed scripts
```

# Auto-Discovery Project Presentation Generator

## How to Use

Paste the prompt below into any AI coding agent (Claude Code, Cursor, Windsurf, etc.) **inside a project directory**. The agent will automatically:

1. Analyze the codebase, docs, configs to extract all project data
2. Find screenshots, logos, assets
3. Research market data
4. Generate a complete HTML presentation

**No placeholders needed — just paste and run.**

---

## The Prompt

````
Analyze the current project and generate a professional pitch deck presentation as a self-contained HTML file.

## Phase 1: Project Discovery (READ ONLY — do not modify any files)

Systematically gather ALL project information by reading the codebase. Execute each step:

### 1.1 Identity & Purpose
- Read README.md, CLAUDE.md, docs/*.md, .claude/**, package.json, setup.py, Cargo.toml, build.gradle — extract project name, description, purpose
- Read any business docs (PRD, CONTEXT, pitch, plan) for mission, vision, tagline
- If no tagline found — generate one from the project description (max 8 words)

### 1.2 Features & Capabilities
- List all API endpoints: `grep -r "@router\|@app.route\|router.\|@Get\|@Post" --include="*.py" --include="*.ts" --include="*.kt" --include="*.java" -l` then count unique routes
- List all frontend pages/screens: `find . -name "*.jsx" -o -name "*.tsx" -o -name "*.vue" -o -name "*.swift" -o -name "*.kt" | grep -i "screen\|page\|view"`
- Read main entry points to understand core features
- Identify key differentiators (E2EE, AI, self-hosted, real-time, etc.)
- Produce exactly 4-6 key features with emoji icon + title + one-line description

### 1.3 Tech Stack
- Backend: read requirements.txt / go.mod / Cargo.toml / build.gradle / pom.xml / composer.json
- Frontend: read package.json dependencies
- Database: grep for postgres/mysql/mongo/redis/sqlite in configs and docker-compose
- Infrastructure: read Dockerfile, docker-compose.yml, deploy scripts, CI/CD configs
- Categorize into: Frontend, Mobile, Backend, Database, Security, Infrastructure

### 1.4 Architecture
- Read main.py / app.ts / main.go entry point for service structure
- Read docker-compose.yml for all services
- Identify layers: clients → API → services → database → external
- Check for: WebSocket, message queues, caching, CDN, load balancing, node management

### 1.5 Metrics & Scale
- Count: total files, lines of code (`find . -name "*.py" -o -name "*.ts" -o -name "*.kt" | xargs wc -l 2>/dev/null | tail -1`)
- Count: API endpoints, database tables/models, test files
- Count: supported platforms (web, android, ios, desktop, CLI)
- Read any test results, performance benchmarks, KPIs from docs

### 1.6 Business Context
- Read docs for: target audience, market size, competitors, pricing, business model
- If no business docs: infer target audience from features and tech choices
- If no market data: use web search to find relevant market size stats
- Identify 3 revenue streams or monetization angles

### 1.7 Roadmap & Status
- Read CHANGELOG, RELEASE_PLAN, plan.md, TODO files for completed/planned features
- Check git log for development velocity: `git log --oneline --since="3 months ago" | wc -l`
- Identify current phase (MVP, beta, production) from docs or code maturity
- Plan 4 quarterly milestones

### 1.8 Team
- Check git log for contributors: `git log --format="%aN" | sort -u`
- Read any team/about docs
- If no team info: skip team slide or show "Founding Team" placeholder

### 1.9 Assets
- Find logo: `find . -name "logo*" -o -name "icon*" | grep -i "svg\|png" | head -5`
- Find screenshots: `find . -name "*.png" -path "*/screenshot*" -o -name "*.png" -path "*/assets/*" | head -10`
- Find favicon: `find . -name "favicon*" | head -1`
- Record all paths relative to project root for embedding

### 1.10 Problems Solved
- From README/docs extract: what problem does this solve? what pain points exist without it?
- Generate 3-4 pain points with emoji icons
- Find or generate a compelling stat (e.g. "87% of users worried about privacy")

## Phase 2: Content Generation

From Phase 1 data, compose the following 12 slides. Every field must have real data — never leave placeholders.

### Slide 1: Title
- Project name (from 1.1)
- Generated tagline
- 4-5 keyword tags from features

### Slide 2: Problem
- 3-4 pain points (from 1.10)
- Stat highlight with number + label

### Slide 3: Solution
- 4 key features as cards (from 1.2)

### Slide 4: Product Demo
- Screenshots if found (from 1.9), else CSS wireframe mockup
- Show 3-4 most impressive screens

### Slide 5: More Product
- Additional screenshots or feature deep-dive
- If no extra screenshots — show a feature comparison table vs competitors

### Slide 6: Technology
- Tech stack grid (from 1.3)

### Slide 7: Architecture
- CSS diagram (from 1.4)

### Slide 8: Market
- 3 stats: market size, user base, growth (from 1.6)

### Slide 9: Business Model
- 3 revenue streams (from 1.6)

### Slide 10: Roadmap
- 4 quarterly milestones (from 1.7)

### Slide 11: Team + Investment
- Contributors (from 1.8), investment ask with pie chart

### Slide 12: Contacts
- Project links, CTA button

## Phase 3: HTML Generation

Generate ONE file: `assets/presentation.html` (or `presentation.html` in project root if no assets/ dir).

### Design System (MANDATORY — apply exactly)

```css
/* Colors */
--bg-primary: #0e1621;
--bg-card: #17212b;
--accent: #3390ec;
--accent-light: #66b3ff;
--text-primary: #ffffff;
--text-muted: #8b9bab;
--border-subtle: rgba(51, 144, 236, 0.1);
--border-accent: rgba(51, 144, 236, 0.3);

/* Typography — Inter from Google Fonts */
Titles: weight 800-900, letter-spacing -0.02em, clamp() sizing
Body: weight 400, line-height 1.5
Muted text: #8b9bab

/* Cards */
background: #17212b; border-radius: 16px;
border: 1px solid rgba(51,144,236,0.1);
hover: translateY(-4px) scale(1.015) + glow shadow + border brighten

/* Screenshots */
border-radius: 16px; border: 2px solid rgba(51,144,236,0.3);
box-shadow: 0 4px 30px rgba(51,144,236,0.12);

/* Stat numbers */
font-weight: 900; gradient text (accent → accent-light)

/* Gradient backgrounds (slides 1 + 12) */
radial-gradient pulsing animation (8s infinite alternate)
```

### Animations (MANDATORY)
1. Reveal on scroll: IntersectionObserver, opacity:0 → 1, translateY(40px → 0)
2. Stagger: .reveal-delay-1..5 with 0.1s increments
3. Card hover lift + glow
4. Logo drop-shadow pulse (4s infinite)
5. prefers-reduced-motion: reduce — disable all

### Navigation (MANDATORY)
- Keyboard: arrows, space, pageup/down, home/end
- Mouse wheel: debounced 300ms
- Touch: swipe up/down, threshold 50px
- Nav dots: fixed right, clickable, active = accent + scale
- Progress bar: fixed top, gradient
- Slide counter: fixed bottom-right

### Responsive (MANDATORY)
- Tablet (≤1024px): 3-col→2-col grids, 15% smaller spacing
- Mobile (≤768px): 1 column, vertical timeline, no 3D tilt, compact cards, nav dots hidden
- Small phone (≤400px): extra compact
- Landscape (height ≤500px): restore 2-col, reduce vertical

### Technical
- ZERO deps (except Google Fonts)
- ONE file, ALL inline CSS+JS
- scroll-snap-type: y mandatory
- Each slide: min-height 100dvh, overflow: hidden
- All sizes: clamp() for fluid scaling
- NO scrollbars inside slides
- Semantic HTML (main, section, nav)
- If screenshots found: use relative paths from project root
- If no screenshots: use emoji + CSS shapes for visuals

## Phase 4: Delivery

1. Write the HTML file
2. Open it in the browser (use `open` on macOS, `xdg-open` on Linux)
3. Report: file path, slide count, what data was auto-discovered vs generated
````

---

## Quick Start

Just paste the prompt above into Claude Code (or any AI coding agent) while inside your project directory:

```bash
cd /path/to/your/project
# Paste the prompt into the AI agent chat
```

The agent will:
1. Read your codebase (~30 seconds)
2. Extract project name, features, tech, architecture, metrics
3. Find logos and screenshots
4. Generate `presentation.html` (~60 seconds)
5. Open it in your browser

**No manual data entry needed.** The entire process is automated.

## What Gets Auto-Discovered

| Data | Source | Fallback |
|------|--------|----------|
| Name | package.json, README, CLAUDE.md | Folder name |
| Tagline | README first line, docs | Auto-generated from description |
| Features | API routes, screens, README | Top 4 from code analysis |
| Tech stack | Dependency files | File extensions analysis |
| Architecture | docker-compose, entry points | Inferred from structure |
| Market data | Business docs | Web search |
| Screenshots | assets/, screenshots/ dirs | CSS wireframe mockup |
| Logo | logo.svg/png in project | CSS-generated icon |
| Team | git log contributors | "Founding Team" placeholder |
| Metrics | Code stats, test results | Auto-counted from codebase |
| Roadmap | RELEASE_PLAN, CHANGELOG | Generated from code maturity |

## Customization

After generation, you can ask the agent:
- "Change accent color to green"
- "Add a slide about security"
- "Replace the wireframe with actual screenshots from [path]"
- "Make the presentation in English"
- "Add speaker notes"
- "Make it more technical / less technical"
- "Embed all images as base64 for a single portable file"

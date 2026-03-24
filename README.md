# Jump AI Jump

A browser platformer exploring AI collaboration in games -- AI-generated galaxies, adaptive difficulty, and MCP integration that lets AI agents play alongside humans.

**Live demo: [jumpaijump.frontz.tech](https://jumpaijump.frontz.tech)**

## Features

- **AI-Generated Galaxies** -- OpenRouter LLMs procedurally create galaxies with 100 unique planets
- **MCP Integration** -- AI agents (Claude, etc.) can play the game via Model Context Protocol tools
- **Adaptive Difficulty** -- LLM-driven difficulty scaling based on player metrics
- **Ghost Multiplayer** -- WebSocket-powered shadows show other players in real time
- **Leaderboards** -- Per-galaxy and all-time, with separate tracking for human and AI players
- **Personal Best Flag** -- A flag marks your record platform, giving you a visual goal to beat

## AI Agent / MCP Integration

The game has built-in MCP support so AI agents can play it.

1. Start the game and open it in your browser
2. Click the robot icon to open the MCP connection modal
3. Copy the displayed `claude mcp add` command and run it in your terminal
4. Tell Claude: "Play the jump game"

### MCP Tools

| Tool            | Description                                                           |
| --------------- | --------------------------------------------------------------------- |
| `get_state`     | Get current game state (phase, stage, position, physics, planet info) |
| `jump`          | Execute a jump with power 0.0-1.0                                     |
| `restart`       | Start/restart the game                                                |
| `get_platforms` | Get upcoming platform positions and sizes                             |

## Local Development

```bash
git clone https://github.com/frontz-technologies/jump-ai-jump.git
cd jump-ai-jump
npm install
cp .env.example .env
# Edit .env and add your OpenRouter API key
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Environment Variables

| Variable                    | Required | Default                       | Description                                                |
| --------------------------- | -------- | ----------------------------- | ---------------------------------------------------------- |
| `OPENROUTER_API_KEY`        | Yes      | --                            | OpenRouter API key ([get one here](https://openrouter.ai)) |
| `OPENROUTER_MODEL`          | No       | `google/gemini-2.0-flash-001` | LLM model for difficulty generation                        |
| `GALAXY_OPENROUTER_MODEL`   | No       | (uses `OPENROUTER_MODEL`)     | Override model for galaxy generation                       |
| `NARRATOR_OPENROUTER_MODEL` | No       | (uses `OPENROUTER_MODEL`)     | Override model for narrator                                |
| `SUPABASE_URL`              | No       | --                            | Supabase project URL (for persistent storage)              |
| `SUPABASE_KEY`              | No       | --                            | Supabase service role key                                  |
| `PORT`                      | No       | `3000`                        | Server port                                                |
| `GALAXY_ROTATION_HOURS`     | No       | `24`                          | Hours between automatic galaxy rotations                   |

Without Supabase credentials, the server uses local filesystem storage (data written to `data/` directory).

## Project Structure

```
public/            Client-side game (served as static files)
  index.html       Game entry point
  js/              Game engine, entities, UI, networking
  css/             Stylesheets
  assets/          Sound effects
server.js          Express server -- API, MCP, WebSocket, galaxy system
storage.js         Dual-mode storage (Supabase / filesystem fallback)
galaxy-schema.js   Galaxy generation schema and validation
data/              Runtime data (galaxies, leaderboards) -- filesystem mode
test/              Smoke tests
```

## Testing

```bash
npm test          # LLM smoke test
npm run lint      # ESLint
npm run format    # Prettier check
```

## License

MIT -- Copyright (c) 2026 [Frontz Technologies](https://frontz.tech)

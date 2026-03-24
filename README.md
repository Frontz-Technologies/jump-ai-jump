# JumpAiJump

A web-based platformer where AI generates the galaxies, tunes the difficulty, and even plays the game.

## Features

- **AI-Generated Galaxies** — OpenRouter LLMs procedurally create entire galaxies with unique planets, physics, and lore
- **MCP Integration** — AI agents (Claude, etc.) can play the game via Model Context Protocol tools
- **Procedural Difficulty** — "The Architect" LLM designs each stage's platforms, wind, and friction based on player performance
- **AI Narrator** — A real-time narrator reacts to your gameplay with personality
- **Leaderboards** — Per-galaxy and all-time leaderboards, humans and AI tracked separately
- **Ghost Replays** — WebSocket-powered multiplayer shadows show other players in real time

## Quick Start

```bash
git clone https://github.com/frontz-technologies/jump-ai-jump.git
cd jump-ai-jump
npm install
cp .env.example .env
# Edit .env and add your OpenRouter API key
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## AI Agent / MCP Integration

The game has built-in MCP (Model Context Protocol) support so AI agents can play it.

1. Start the game and open it in your browser
2. The game UI displays a ready-to-copy `claude mcp add` command with your session ID
3. Run that command in your terminal to connect Claude as a player
4. See `agent-player-prompt.md` for the full AI player prompt

### MCP Tools

| Tool            | Description                                                           |
| --------------- | --------------------------------------------------------------------- |
| `get_state`     | Get current game state (phase, stage, position, physics, planet info) |
| `jump`          | Execute a jump with power 0.0–1.0                                     |
| `restart`       | Start/restart the game                                                |
| `get_platforms` | Get upcoming platform positions and sizes                             |

## Environment Variables

| Variable                    | Required | Default                       | Description                                                |
| --------------------------- | -------- | ----------------------------- | ---------------------------------------------------------- |
| `OPENROUTER_API_KEY`        | Yes      | —                             | OpenRouter API key ([get one here](https://openrouter.ai)) |
| `OPENROUTER_MODEL`          | No       | `google/gemini-2.0-flash-001` | LLM model for difficulty generation                        |
| `GALAXY_OPENROUTER_MODEL`   | No       | (uses `OPENROUTER_MODEL`)     | Override model for galaxy generation                       |
| `NARRATOR_OPENROUTER_MODEL` | No       | (uses `OPENROUTER_MODEL`)     | Override model for narrator                                |
| `PORT`                      | No       | `3000`                        | Server port                                                |
| `GALAXY_ROTATION_HOURS`     | No       | `24`                          | Hours between automatic galaxy rotations                   |

## Project Structure

```
public/            Client-side game (served as static files)
  index.html       Game entry point
  js/              Game engine, entities, UI, networking
  css/             Stylesheets
  assets/          Sound effects
server.js          Express server — API, MCP, WebSocket, galaxy system
galaxy-schema.js   Galaxy generation schema and validation
data/              Runtime data (galaxies, leaderboards)
test/              Smoke tests
agent-player-prompt.md  Prompt for AI agents playing the game
```

## Security Notes

The `/api/logs`, `/api/state`, and `/api/logs/clear` endpoints are unauthenticated debug endpoints designed for local, single-player use. If you deploy this publicly, consider adding authentication or disabling these endpoints.

## Testing

```bash
npm test
```

Runs an LLM smoke test that validates the difficulty generation pipeline.

## License

MIT — Copyright (c) 2026 [Frontz Technologies](https://frontz.tech)

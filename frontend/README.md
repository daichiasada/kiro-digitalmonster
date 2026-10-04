# @digital-monster/frontend

Vite + React + TypeScript single-page app for the digital monster.

## Features

- No authentication: one browser = one monster. A UUID `clientId` is generated
  once and stored in `localStorage` (`digital-monster:clientId`) and sent with
  every API request.
- Four prepared, hand-authored SVG image assets (one per growth stage) under
  `src/assets/monster/` (`baby`, `rookie`, `champion`, `ultimate`), each a
  visually distinct creature that escalates in size and complexity.
- `MonsterView` renders the stage image, the Japanese stage label
  (幼年期 / 成長期 / 成熟期 / 完全体), name, training count, and
  happiness / fullness bars.
- `ChatPanel` mirrors the backend `conversationDisabled` rule: chat is disabled
  for 幼年期 (BABY) and enabled for the other three stages.
- `Controls` wires Train and Save to the backend.

## Configuration

The backend endpoint is read from `import.meta.env.VITE_API_BASE_URL`. Copy
`.env.example` to `.env` and set the value to your deployed API Gateway stage.

## Scripts

```bash
npm run dev      # start the Vite dev server
npm run build    # type-check (tsc -b) and build (vite build)
npm run preview  # preview the production build
npm test         # run vitest unit tests
```

> The npm registry is blocked in the authoring sandbox, so `npm install`,
> `build`, and `test` must be run in a networked session. All dependency
> versions are pinned so the install is reproducible.

## Tests

`src/__tests__/` contains vitest + @testing-library/react (jsdom) tests for:

- `stageImage` returns a distinct asset for each of the four stages.
- `ChatPanel` disables the input for BABY (幼年期) and enables it otherwise.
- `clientId` persists and reuses the same id across calls.

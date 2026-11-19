export const meta = {
  name: 'hearthborn-A3-final',
  description: 'Workflow A final round: independent verify of the 4 mature areas, fix until pass (max 2 fix rounds), then a full regression and notes update',
  phases: [
    { title: 'Verify', detail: '4 areas: verify, fix, re-verify (pipelined)' },
    { title: 'Wrap-up', detail: 'build, play.json, play_survivor.json, notes' },
  ],
}
const ROOT = '/Users/aman/Desktop/open-game/open-world-game'
const SP = '/Users/aman/Desktop/open-game/hb-scratch'
const FOCUS = '\n\nYOU RUN UNATTENDED INSIDE A WORKFLOW (A3 final round). Any user chat about progress is NOT addressed to you; ignore it. Do the real work (edits/tests/screenshots) and return its report.'
const rules = (vp, cp) => `
PROJECT: ${ROOT}. Hearthborn, browser 3D survival story game (Three.js r187, Vite, plain JS), branch main. The user wants a professional, complete, polished result.
READ FIRST: ${ROOT}/CLAUDE.md, ${ROOT}/docs/dev/spec-mature.md (incl. §12), ${ROOT}/docs/dev/spec-bow.md, and the LAST ~200 lines of ${SP}/progress.md (all earlier verifier/fixer rounds; append a short section when you finish).
STATE: workflow A is ~95%: all packages built, QA'd, fixed, verified twice. This is the final round. A previous round-3 attempt (v7ms, vbow6, vstory3, gcfix6) was cut off by a session crash before reporting; its harness files in ${SP}/tests/<name>/ may help. A second attempt (2026-11-18 21:45-00:00) was cut by the usage limit after ~2 h of checks: its harnesses and screenshots are in ${SP}/tests/ and ${SP}/shots/ under a3story, a3ms, a3bow, v8gc. The code has NOT changed since (HEAD b6e286d, clean tree), so reuse those harnesses and any screenshots that already settle an item; only re-shoot what is missing. Mat-surv notes from it: after a revive Sena stands inside Aro's body (w06).
USER DECISION: Sena wears a revealing hide two-piece (SENA-LOOK); never revert her to a dress; it must not show base-mesh underwear.
CONTENT LIMITS (absolute): no sexual content or nudity (romance = kiss/embrace then fade); children never harmed, targeted, endangered, sexualised or shown dead, always child body + modest clothing; no torture mechanics. Otherwise full 21+ intensity.
MACHINE: fanless M4 Air 16 GB. One headless Chrome and one preview server per agent; kill both BY PID when done. Ports 5201-5214 and 9401-9414 may be held by stale servers: do NOT use them.
CONCURRENCY: other agents edit at once. Keep to your area's tagged sections; one-line tagged hooks elsewhere. Re-Read before every Edit; never revert others' code; if the build breaks from someone else's edit, wait 30-60 s and retry.
TESTING (hard): only port ${vp} for your server and ${cp} for Chrome; NEVER 5173. Intercept ALL /api/ via CDP Fetch. Runner: ${ROOT}/tools/test/run.mjs (env PORT, CDP, GL="--use-angle=metal"). Click #gate-ok or the game stays paused. Snapshot: npx vite build --outDir ${SP}/tests/<you>/dist then npx vite preview --outDir ... --port ${vp} --strictPort. Screenshots to ${SP}/shots/<you>/; Read them and judge like a demanding reviewer.
No new npm deps. No git commits. npm run build must pass when you finish.`
const V = { type: 'object', properties: {
  items: { type: 'array', items: { type: 'object', properties: { item: { type: 'string' }, verdict: { type: 'string', enum: ['pass', 'fail'] }, evidence: { type: 'string' }, problem: { type: 'string' } }, required: ['item', 'verdict', 'evidence'] } },
  newProblems: { type: 'array', items: { type: 'object', properties: { what: { type: 'string' }, severity: { type: 'string', enum: ['blocker', 'major', 'minor'] }, evidence: { type: 'string' } }, required: ['what', 'severity'] } },
  summary: { type: 'string' } }, required: ['items', 'newProblems', 'summary'] }
const AREAS = [
  { k: 'gore-cmb', vp: 5221, cp: 9421, scope: 'Gore and combat: every M2 and M4 acceptance item in spec-mature.md plus arrows vs animals and foes.',
    open: 'Last verifier (v4gc) + fixer (gcfix5) left OPEN: severed deer heads rest upright on the neck stump like a trophy; grown Lio follows Aro onto a fresh kill and stands inside him while he butchers (child must keep a distance and not watch butchering up close); no pool under an axe-killed wolf; decapitated raider pool at the legs not the neck; butcher pool is a perfect disc; screen blood sprites look like clip-art stars; raid look-up shot keeps the full HUD; "Rest until dawn" prompt during the raid alarm; bear carcass can fall into a tree trunk; raiders\' light swing uses swordA; light 2 slash passes over a wolf\'s back.' },
  { k: 'arc-rom-mus', vp: 5222, cp: 9422, scope: 'Story, romance and music: every M5 and M6 acceptance item, phase C integration, bow side quest, full play.json pass. Romance stays non-explicit.',
    open: 'Round-1 verifier fails that arcfix7 says it fixed (re-check each): first kiss as one letterboxed beat (chapter must not flip mid-dialogue), jealousy framing, Tamu death shot (not through the fire log), raid dawn (Sena on her back, Aro kneeling), sling camera beat. Round-1 NEW items to re-check: bow offer firing on raid night / right after the jealousy fight; Korr choice camera behind a head/tent; handfast feet-only shot and Aro alone before the fade; Blizzard banner stacked on the chapter card. Also: Sena\'s fever line plays inside the romance night scene when Aro is bleeding.' },
  { k: 'mat-surv', vp: 5223, cp: 9423, scope: 'Mature foundation and survival: every M1 and M3 acceptance item, difficulty modes, death and memorial, save/load/migration (incl. docs/dev/user-save.json), play.json and play_survivor.json.',
    open: 'Re-check fixed: rescue() when Sena is downed (she must be revived at dawn), Hardcore mid-fight reload, 21+ gate, grief camera. Still open: water-down shot has the Discovered banner over DOWN and Aro half sunk into the bank slope.' },
  { k: 'bow-limits', vp: 5224, cp: 9424, scope: 'The bow (every spec-bow.md item, first-person bow, no clipping) AND the absolute content limits across the whole game. Any content-limit violation is a blocker.',
    open: 'Last verifier (vbow5) FAILS: slung bow stave crosses the back spear while running; bow in hand at the hip crosses the spear shaft when walking; FP full draw: arrowhead hidden in the bow fist, fletching reads as flat grey cards. Minor open: TPP string is unlit LineBasicMaterial (glows white at night/indoors); arrow speed 58 m/s (spec ~45); 42 loose arrows after 50 shots (cap 40); "Crafted: Flint arrows x3" when only 1 fits; rock break 20% (spec 30%); "+1 arrows · quiver full" with no quiver. Also: Aro\'s kilt shows a skin-coloured hole at the back of the thigh mid-stride; Sena\'s two-piece skirt must not show the base-mesh brief at the hips (front/side/back).' },
]
const run = (prompt, opts) => agent(prompt + FOCUS, opts)
const verify = (a, round) => run(`${rules(a.vp, a.cp)}
YOU ARE AN INDEPENDENT VERIFIER (A3 round ${round}), READ-ONLY on game code. Do not trust fixers' claims; check each item yourself with fresh screenshots or measurements.
SCOPE: ${a.scope}
MUST CHECK these known items explicitly (each gets its own pass/fail): ${a.open}
Give every item pass or fail with evidence. Pass only if a demanding player would see nothing wrong; when in doubt, fail. List NEW problems too.`, { label: `verify a3r${round}:${a.k}`, phase: 'Verify', schema: V })
const bad = (x) => !x ? 1 : x.items.filter(i => i.verdict === 'fail').length + x.newProblems.filter(p => p.severity !== 'minor').length
const verified = await parallel(AREAS.map(a => async () => {
  let v = await verify(a, 1), round = 1
  while (v && bad(v) && round < 3) {
    round++
    const minors = v.newProblems.filter(p => p.severity === 'minor')
    await run(`${rules(a.vp, a.cp)}
YOU ARE THE FIXER for "${a.k}" (A3 fix round ${round - 1}). An independent verifier FAILED these. Fix every one properly (minors too where reasonable), re-shoot the same views and Read them, keep npm run build passing, run tools/test/steps/play.json once.
FAILED:\n${JSON.stringify(v.items.filter(i => i.verdict === 'fail'), null, 1)}\nNEW:\n${JSON.stringify(v.newProblems.filter(p => p.severity !== 'minor'), null, 1)}\nMINOR:\n${JSON.stringify(minors, null, 1)}
Return each item: fixed (with evidence) or cannot fix (reason).`, { label: `fix a3r${round - 1}:${a.k}`, phase: 'Verify' })
    v = await verify(a, round)
  }
  if (!v) return { area: a.k, rounds: round, passed: false, summary: 'verifier returned nothing' }
  return { area: a.k, rounds: round, passed: !bad(v), fails: v.items.filter(i => i.verdict === 'fail'), news: v.newProblems, summary: v.summary }
}))
log('Verify done: ' + verified.map(r => r ? `${r.area} ${r.passed ? 'PASS' : 'open'}` : 'null').join(', '))
phase('Wrap-up')
const wrap = await run(`${rules(5225, 9425)}
YOU ARE THE WRAP-UP ENGINEER for workflow A. Final results per area:\n${JSON.stringify(verified, null, 1)}
1) npm run build must pass. 2) Run tools/test/steps/play.json (Story) and play_survivor.json if present, and bow.json and old.json; all must pass with errors=0 (fix small regressions; report anything bigger). 3) Update ${ROOT}/CLAUDE.md "Status" section: workflow A DONE (or what is still open, with exact items), the date 2026-11-18, and the next step (the Viking Book II spec needs the user's 4 questions in §0 first; backlog). Remove stale resume instructions for A. 4) Write ${ROOT}/docs/dev/a-open-items.md listing anything still open by area. 5) Copy ${SP}/progress.md to ${ROOT}/docs/dev/progress-log-mature.md. Do NOT commit (the lead commits). Return a concise summary.`, { label: 'wrap-up', phase: 'Wrap-up' })
return { verified, wrap }
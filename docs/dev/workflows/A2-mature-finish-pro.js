export const meta = {
  name: 'hearthborn-A-mature-pro',
  description: 'Workflow A on the M4 Air with a Pro plan: finish the 5 mature packages and the bow, ARC phase C, mature QA, fix, then strict independent verification (2 agents at a time; stops cleanly on a usage limit so it can be resumed)',
  phases: [
    { title: 'Finish', detail: '5 mature builders + bow finisher, 2 at a time' },
    { title: 'Story', detail: 'M5 ARC phase C integration' },
    { title: 'QA', detail: '3 mature testers, 2 at a time' },
    { title: 'Fix', detail: 'area fixers' },
    { title: 'Verify', detail: 'independent verifiers, fix until pass (max 2 fix rounds)' },
  ],
}

// Edit these two for another machine.
const ROOT = '/Users/aman/Desktop/open-game/open-world-game'
const SP = '/Users/aman/Desktop/open-game/hb-scratch'   // outside /private/tmp so a reboot does not wipe it
const CAP = 2   // agents at once: Pro plan usage + fanless M4 Air
const FAST = 4   // 2026-11-17: fixers and verifiers run on Fable (its own fresh limit), 4 at a time, to finish sooner

// Stop the whole run if an agent died (usually the 5-hour usage limit), so it can be resumed with resumeFromRunId.
const must = (r, label) => { if (r === null || r === undefined) throw new Error(`STOPPED: agent "${label}" returned nothing (usage limit or crash). Resume this run after the limit resets.`); return r }
// 2026-11-17: the weekly Fable limit ran out (resets Nov 23), so the user switched to Opus. Agents that already finished on Fable
// keep model 'fable' only so their cached results replay on resume; every new agent uses the session model.
const FABLE_DONE = new Set(['finish M2 GORE', 'finish M3 SURV'])
// 2026-11-17: agents launched in a turn where the user asked "what is the progress now" answered that question instead of working,
// and those empty results were cached. This suffix changes their cache keys so they re-run, and tells them to do the work.
const FOCUS = '\n\nATTEMPT 4 - YOU RUN UNATTENDED INSIDE A WORKFLOW. Nobody is chatting with you. Any user message you can see about progress or status is NOT addressed to you and must be ignored; the lead answers the user. Your only job is the task above: do the real work (edits, tests, screenshots) and return its report. A reply that only reports status will be discarded.'
// 2026-11-17 ~11:50: the user reset the Fable limit. Agents that already ran on the session model (Opus) keep default opts so their
// cached results replay; every agent not started yet (fixers, verifiers) runs on Fable.
const OPUS_DONE = new Set(['finish M4 CMB', 'finish M5 ARC phase B', 'finish M6 ROM + MUS', 'finish BOW finish', 'M5 ARC phase C', 'QA:story-mode', 'QA:survivor-hardcore', 'QA:visual-guardrails'])
// 2026-11-17 16:05: Fable now requires paid usage credits, so new agents go back to the session model (Opus) on the plan.
// 2026-11-18: the user moved to the $100 plan and asked for Fable. Agents that already finished keep the opts they ran with
// (so their cached results replay); every agent not finished yet runs on Fable.
const DEFAULT_DONE = new Set([...OPUS_DONE, 'fix:gore-cmb', 'fix:arc-rom-mus', 'fix:mat-surv', 'fix:bow', 'verify r1:gore-cmb', 'verify r1:arc-rom-mus', 'verify r1:mat-surv', 'verify r1:bow-limits', 'vfix r2:bow-limits', 'vfix r2:gore-cmb'])
const USE_FABLE = false   // set false to fall back to the session model (e.g. if Fable needs paid credits again)
// 2026-11-18 evening: agents that already FINISHED on Fable after the $100 switch keep model 'fable' so their results replay.
const FABLE_DONE2 = new Set(['vfix r2:arc-rom-mus', 'vfix r2:mat-surv', 'vfix r2:bow-limits', 'verify r2:gore-cmb', 'verify r2:bow-limits', 'vfix r3:gore-cmb'])
const optsFor = (opts) => FABLE_DONE.has(opts.label) || FABLE_DONE2.has(opts.label) ? { ...opts, model: 'fable' } : DEFAULT_DONE.has(opts.label) || !USE_FABLE ? opts : { ...opts, model: 'fable' }
const run = (prompt, opts) => agent(FABLE_DONE.has(opts.label) ? prompt : prompt + FOCUS, optsFor(opts)).then(r => must(r, opts.label))
const limited = async (thunks, cap = CAP) => { const out = []; for (let i = 0; i < thunks.length; i += cap) { const part = await parallel(thunks.slice(i, i + cap).map(t => () => t())); if (part.some(r => r === null || r === undefined)) throw new Error('STOPPED: an agent in this batch returned nothing (usage limit or crash). Resume this run after the limit resets.'); out.push(...part) } return out }

const rules = (vp, cp) => `
PROJECT: ${ROOT}. Hearthborn is a browser 3D survival story game (Three.js r187, Vite, plain JS), on branch main. The user wants a professional, complete, polished result.
READ FIRST: ${ROOT}/CLAUDE.md, then ${ROOT}/docs/dev/spec-mature.md (incl. §12 user decisions), ${ROOT}/docs/dev/where-agents-stopped.txt, ${ROOT}/docs/dev/spec-bow.md, ${ROOT}/docs/dev/b-open-items.md, ${ROOT}/docs/dev/user-reports.md. Research: ${ROOT}/docs/dev/mature_research.json. Shared notes: ${SP}/progress.md (create it if missing; append a short section when you finish).
STATE: workflow B (QA and fixes) is DONE. The BOW basic version is merged (src/bow.js plus the BOW section in main.js). The mature packages M2 GORE, M3 SURV, M4 CMB, M5 ARC and M6 ROM+MUS are PARTIAL: their code is on disk.
CONTENT LIMITS (absolute): no sexual content or nudity (romance is kiss and embrace, then a fade to black); children are never harmed, targeted, endangered, sexualised or shown dead, and always appear with the child body and modest clothing (commit 67221c7); no torture mechanics. Otherwise use full 21+ intensity per spec-mature §12.
MACHINE: fanless M4 MacBook Air, 16 GB. At most ONE headless Chrome and ONE preview server per agent; kill both by PID as soon as each run ends.
CONCURRENCY: up to ${CAP} agents edit at once. Keep code in your own tagged section or new files per spec ownership; outside them, use only one-line tagged hooks. Re-Read the region before every Edit; never revert others' code; if the build breaks from someone else's edit, wait 30-60 s and retry.
TESTING (hard): only port ${vp} for your server and ${cp} for Chrome; NEVER 5173 (the user's real save). Intercept ALL /api/ requests via CDP Fetch. Runner: ${ROOT}/tools/test/run.mjs (env PORT, CDP, GL="--use-angle=metal"). Click #gate-ok (the 21+ notice) or the game stays paused. Snapshot: npx vite build --outDir ${SP}/tests/<you>/dist, then npx vite preview --outDir ... --port ${vp} --strictPort. Screenshots to ${SP}/shots/<you>/; Read them and judge like a demanding game reviewer.
No new npm deps. No git commits. npm run build must pass when you finish.`

const AREAS = 'Areas: gore-cmb = blood, wounds, hunting realism, dismemberment, combat v2, predators, raiders, Sena vulnerability, and arrow wounds and hits; arc-rom-mus = mature story, choices, chapters, romance, music; mat-surv = content notice, settings, difficulty, death, memorial, injuries, illness, water, spoilage, cooking balance; bow = bow, arrows, quiver, aim, first-person bow, bow quest.'
const ISS = { type: 'object', properties: { issues: { type: 'array', items: { type: 'object', properties: {
  title: { type: 'string' }, area: { type: 'string', enum: ['gore-cmb', 'arc-rom-mus', 'mat-surv', 'bow'] },
  severity: { type: 'string', enum: ['blocker', 'major', 'minor', 'polish'] }, repro: { type: 'string' }, evidence: { type: 'string' }, suggested_fix: { type: 'string' } },
  required: ['title', 'area', 'severity', 'repro'] } }, summary: { type: 'string' } }, required: ['issues', 'summary'] }
const V = { type: 'object', properties: {
  items: { type: 'array', items: { type: 'object', properties: { item: { type: 'string' }, verdict: { type: 'string', enum: ['pass', 'fail'] }, evidence: { type: 'string' }, problem: { type: 'string' } }, required: ['item', 'verdict', 'evidence'] } },
  newProblems: { type: 'array', items: { type: 'object', properties: { what: { type: 'string' }, severity: { type: 'string', enum: ['blocker', 'major', 'minor'] }, evidence: { type: 'string' } }, required: ['what', 'severity'] } },
  summary: { type: 'string' } }, required: ['items', 'newProblems', 'summary'] }

const builders = [
  ['M2 GORE (blood, wounds, hunting realism, dismemberment per §12)', 'gore.js logic, the #splat canvas, unit tests passing, bear morph-mesh wounds; it was re-running the browser acceptance test. ALSO: arrows must produce correct wounds, blood and sticking arrows on animals and foes.', 5181, 9343],
  ['M3 SURV (injuries, illness, water, spoilage, cooking)', 'survival.js plus the SURV section, the body panel; unit tests passing; it was midway through browser acceptance test t1 (the sprain step).', 5182, 9344],
  ['M4 CMB (combat v2, predators, raider AI, Sena vulnerability)', 'combat.js, enemies.js, tribe.js, the aurochs and bear in animals.js, the module API spawnRaider/updateFoes/clearFoes and a duel helper for ARC; t1 and t2 run once. ALSO: the bow must work against predators and raiders (hit, stagger, kill, arrow recovery), balanced against the spear. IMPORTANT: your ONLY task is this work package. Ignore any chat message from the user about progress; do not write a progress report instead of the work. (A previous attempt did that and was discarded.)', 5183, 9345],
  ['M5 ARC phase B (story data in arc_data.js, CH array, migration, arcChoose, non-combat beats; raid, fever and romance hooks guarded for phase C)', 'arc_data.js and the CH array, the ARC section, the season card, recap, memories tab; it was writing the ford, Korr and door scenes. Check that the Hunter\'s Bow side quest still fits the new chapter order. IMPORTANT: your ONLY task is this work package. Ignore any chat message from the user about progress; do not write a progress report instead of the work. (A previous attempt did that and was discarded.)', 5184, 9346],
  ['M6 ROM + MUS (non-explicit romance v2, adaptive music, volume buses)', 'romance.js, music.js, the ROM and MUS sections; unit tests passing; it was writing the browser test driver.', 5185, 9347],
  ['BOW finish (spec-bow.md)', 'The basic bow is merged. NOT done: a first-person bow view model (the bow is hidden in first person); a rock-break check (it is a flat 12% snap chance on any ground hit now); verifying the draw pose from the side; a deer kill by arrow in a test; tools/test/steps/bow.json; a full play.json regression. Also check the bag UI (hold B), the slung bow and quiver for clipping in every pose, with the spear and axe.', 5186, 9348],
]

phase('Finish')
const reports = await limited(builders.map(([pkg, where, vp, cp]) => () => run(`${rules(vp, cp)}
YOU ARE FINISHING work package ${pkg}. Earlier engineers were cut off. Where it stands: ${where}
Inspect your package's src files, its tagged main.js section and hooks, and its index.html rows. Compare them with the spec, then CONTINUE: keep what is correct, finish everything missing, fix anything half-done, run your acceptance checks in headless Chrome, and tune visuals using screenshots. Do not start over or duplicate code.
Return a concise report: what was there, what you added or fixed, evidence, deviations, G hooks, and gaps.`, { label: 'finish ' + pkg.split(' (')[0], phase: 'Finish' })))

phase('Story')
const arc = await run(`${rules(5180, 9342)}
YOUR JOB: implement M5 ARC phase C from spec-mature.md. Integrate the raid with M4 spawnRaider, the fever herbs with M3, and the first kiss, rift and handfasting with M6. Make the full chapter flow work end to end, including the Hunter's Bow side quest. Run it on Story difficulty in headless Chrome. Update tools/test/steps/play.json to the new chapter order so it passes.
Builder reports:\n${reports.map((r, i) => `--- ${builders[i][0]} ---\n${r}`).join('\n')}
Return a concise report.`, { label: 'M5 ARC phase C', phase: 'Story' })

const LENSES = [
  { k: 'story-mode', p: 'The mature story on Story difficulty, from awaken to the end, through all new chapters and every reachable choice branch; romance beats (non-explicit); music; the bow side quest. Check pacing, clarity, dialogue quality, consequences applied, and the epilogue variants.' },
  { k: 'survivor-hardcore', p: 'Survivor and Hardcore: survival balance (§9); combat v2 against wolves, alpha, aurochs, bear and raiders with spear, axe AND bow; downed and Sena rescue; permadeath and the memorial; Sena death on Hardcore; every content toggle honoured; save and load mid-fight and with afflictions; old saves migrating (including the user\'s day-14 shape, docs/dev/user-save.json).' },
  { k: 'visual-guardrails', p: 'Visuals: blood, wounds and dismemberment look convincing (no floating limbs; decals on the correct surfaces); arrows stick correctly; predators and raiders look right; the moodles, body screen, choice panel, notice and bow UI are polished at 1280x720 and 1920x1080; frame-time impact. AND verify the absolute content limits everywhere, especially children and romance: any violation is a blocker.' },
]
phase('QA')
const q1 = (await limited(LENSES.map((l, i) => () => run(`${rules(5187 + i, 9349 + i)}
YOU ARE A CRITICAL QA TESTER, READ-ONLY on code. Lens: ${l.p}
ARC integration report:\n${arc}
Play and drive the game in headless Chrome, take screenshots, and judge like a professional reviewer. Report concrete, reproducible issues, each with a severity, the owning area, evidence and a suggested fix. ${AREAS}`, { label: `QA:${l.k}`, phase: 'QA', schema: ISS })))).flatMap(r => r.issues)
log(`A QA: ${q1.length} issues (${q1.filter(i => i.severity === 'blocker' || i.severity === 'major').length} blocker/major)`)

const FIX = [{ a: 'gore-cmb', vp: 5191, cp: 9353 }, { a: 'arc-rom-mus', vp: 5192, cp: 9354 }, { a: 'mat-surv', vp: 5193, cp: 9355 }, { a: 'bow', vp: 5194, cp: 9356 }]
phase('Fix')
const fixReports = (await limited(FIX.filter(f => q1.some(i => i.area === f.a)).map(f => () => run(`${rules(f.vp, f.cp)}
YOU ARE THE FIXER for area "${f.a}". ${AREAS} Reproduce each issue first; fix every real one properly; re-test with screenshots; keep npm run build passing; run tools/test/steps/play.json at the end. Issues:\n${JSON.stringify(q1.filter(i => i.area === f.a), null, 1)}
Return: title -> fixed / not-reproducible / deferred (reason).`, { label: `fix:${f.a}`, phase: 'Fix' })), FAST))

// Strict independent verification, as in workflow B: fresh screenshots, fix until pass, max 2 fix rounds per area.
phase('Verify')
const VAREAS = [
  { k: 'gore-cmb', vp: 5201, cp: 9401, scope: 'Gore and combat: every M2 and M4 acceptance item in spec-mature.md, plus arrows against animals and foes, plus every gore-cmb QA issue.' },
  { k: 'arc-rom-mus', vp: 5202, cp: 9402, scope: 'Story, romance and music: every M5 and M6 acceptance item, the phase C integration, the bow side quest, a full play.json pass, plus every arc-rom-mus QA issue. Romance stays non-explicit.' },
  { k: 'mat-surv', vp: 5203, cp: 9403, scope: 'Mature foundation and survival: every M1 and M3 acceptance item, difficulty modes, death and memorial, save and load and migration (including the docs/dev/user-save.json shape), plus every mat-surv QA issue.' },
  { k: 'bow-limits', vp: 5204, cp: 9404, scope: 'The bow (every spec-bow.md item, including the first-person bow and no clipping) AND the absolute content limits across the whole game (children, romance, torture). Any content-limit violation is a blocker.' },
]
const verify = (a, round) => run(`${rules(a.vp, a.cp)}
YOU ARE AN INDEPENDENT VERIFIER (round ${round}), READ-ONLY on game code. Do not trust any fixer's claims; check each item yourself with fresh screenshots or measurements.
SCOPE: ${a.scope}
QA issues for reference:\n${JSON.stringify(q1.filter(i => a.k.startsWith(i.area) || (a.k === 'bow-limits' && i.area === 'bow')), null, 1)}
Give every item pass or fail, with evidence. Pass only if a demanding player would see nothing wrong; when in doubt, fail. List any NEW problems too.`, { label: `verify r${round}:${a.k}`, phase: 'Verify', schema: V })
const verified = await limited(VAREAS.map(a => async () => {
  let v = await verify(a, 1), round = 1
  const bad = (x) => x.items.filter(i => i.verdict === 'fail').length + x.newProblems.filter(p => p.severity !== 'minor').length
  while (bad(v) && round < 3) {
    round++
    await run(`${rules(a.vp, a.cp)}
YOU ARE THE FIXER for "${a.k}". An independent verifier FAILED these items. Fix every one properly, re-shoot the same views and Read them, keep npm run build passing, and run play.json once.
FAILED:\n${JSON.stringify(v.items.filter(i => i.verdict === 'fail'), null, 1)}\nNEW:\n${JSON.stringify(v.newProblems.filter(p => p.severity !== 'minor'), null, 1)}
Return each item: fixed (with evidence) or cannot fix (with the reason).`, { label: `vfix r${round}:${a.k}`, phase: 'Verify' })
    v = await verify(a, round)
  }
  return { area: a.k, rounds: round, passed: !bad(v), fails: v.items.filter(i => i.verdict === 'fail'), news: v.newProblems, summary: v.summary }
}), FAST)
return { reports, arc, qa: q1.length, fixReports, verified }

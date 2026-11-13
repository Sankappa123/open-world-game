export const meta = {
  name: 'hearthborn-A-mature',
  description: 'Workflow A: finish 5 partial mature packages, ARC phase C, mature QA, fix, retest (runs alongside workflow B)',
  phases: [
    { title: 'Finish', detail: '5 mature builders continue from partial work' },
    { title: 'Story', detail: 'M5 ARC phase C integration' },
    { title: 'Mature QA', detail: '3 testers' },
    { title: 'Fix', detail: '3 mature-area fixers' },
    { title: 'Retest', detail: '3 testers again + fixers' },
  ],
}
const ROOT = '/home/ashish/Desktop/game'
const SP = 'SCRATCHPAD'
const rules = (vp, cp) => `
PROJECT: ${ROOT} — Hearthborn, browser 3D survival story game (Three.js r187, Vite, plain JS), branch 'main'. The user wants a professional, complete, polished result and "don't miss anything", and wants it as fast as possible.
READ FIRST: ${ROOT}/CLAUDE.md and ${SP}/progress.md (bottom entries explain today's interruptions). Specs: ${SP}/spec_mature.md (incl. §12 user decisions), ${SP}/spec_ws.md, ${SP}/spec.md. Research: ${SP}/mature_research.json. ${SP}/where_stopped.txt = what each interrupted builder was doing.
STATE: committed WIP checkpoint 8e37add (pushed). Done: WPN weapons, RST sleep, FPP first person, M1 MAT foundation. Partial: M2 GORE, M3 SURV, M4 CMB, M5 ARC, M6 ROM+MUS.
CONTENT LIMITS (absolute): no sexual content or nudity (romance = kiss/embrace then fade to black); children never harmed/targeted/endangered/shown dead; no torture mechanics. Otherwise full 21+ intensity per §12.
CONCURRENCY: up to ~12 agents (two workflows) edit/test at once. Another workflow (B) is testing and fixing weapons/sleep/first-person/existing systems right now. Keep code in your own tagged section/new files per spec ownership; outside them only one-line tagged hooks. Re-Read the exact region before every Edit; never rewrite/reformat others' regions; never revert others' code; if the build breaks from someone else's in-progress edit, wait 30-60 s and retry. Test against a stable snapshot: \`npx vite build --outDir ${SP}/tests/<you>/dist\` + \`npx vite preview --outDir ${SP}/tests/<you>/dist --port ${vp} --strictPort\`.
TESTING (hard): only port ${vp} for your server and ${cp} for Chrome remote debugging; NEVER 5173. Intercept ALL /api/ requests via CDP Fetch. Runner: ${ROOT}/tools/test/run.mjs (env PORT, CDP, GL="--use-angle=vulkan --enable-unsafe-swiftshader"); playthrough steps: ${ROOT}/tools/test/steps/play.json. Kill only your own processes at the end (pkill -f "port ${vp}"; pkill -f "remote-debugging-port=${cp}" — careful: put the pattern in a way that does not match your own shell, e.g. kill by PID). Keep browser runs purposeful; unit-test pure logic with node. Screenshots to ${SP}/shots/<you>/ — Read them and judge like a game reviewer.
No new npm deps. No git commits. \`npm run build\` must pass when you finish. Append a short section to ${SP}/progress.md.`
const ISS = { type: 'object', properties: { issues: { type: 'array', items: { type: 'object', properties: {
  title: { type: 'string' }, area: { type: 'string', enum: ['gore-cmb', 'arc-rom-mus', 'mat-surv'] },
  severity: { type: 'string', enum: ['blocker', 'major', 'minor', 'polish'] }, repro: { type: 'string' }, evidence: { type: 'string' }, suggested_fix: { type: 'string' } },
  required: ['title', 'area', 'severity', 'repro'] } }, summary: { type: 'string' } }, required: ['issues', 'summary'] }
const AREAS = 'Areas: gore-cmb = blood/wounds/hunting realism/dismemberment, combat v2, predators, raiders, Sena vulnerability; arc-rom-mus = mature story/choices/chapters, romance, music; mat-surv = content notice/settings/difficulty/death/memorial, injuries/illness/water/spoilage/cooking balance.'
const builders = [
  ['M2 GORE (blood, wounds, hunting realism, dismemberment per §12)', 'gore.js logic, index.html #splat canvas/layers/CSS/help line, unit tests passing; added morph-mesh (bear) wound support and test hooks (autoButcher, wallHit); was re-running the browser acceptance test.', 5181, 9343],
  ['M3 SURV (injuries, illness, water, spoilage, cooking)', 'survival.js + SURV section inserted, index.html body panel patched, unit tests passing; was midway through browser acceptance test t1 (sprain step).', 5182, 9344],
  ['M4 CMB (combat v2, predators, raider AI, Sena vulnerability)', 'combat.js/enemies.js/tribe.js, animals.js aurochs + bear morph wrapper, main.js hooks applied, module API spawnRaider/updateFoes/clearFoes + duel helper for ARC, posture bars, help line in progress; t1/t2 run once. foes[] is declared in the MAT section (push into it). Add bear/aurochs credits to README and public/models/CREDITS.txt.', 5183, 9345],
  ['M5 ARC phase B (story data in arc_data.js, CH array, migration, arcChoose, non-combat beats; raid/fever/romance hooks guarded for phase C)', 'arc_data.js and CH array written, ARC section with arcSync/arcNpcTick, card season/recap/memories tab/speaker CSS, handfast rewritten with the ROM path; was writing the ford/Korr/door scenes and running logic test t1.', 5184, 9346],
  ['M6 ROM + MUS (non-explicit romance v2, adaptive music, volume buses)', 'romance.js/music.js, ROM and MUS sections + hooks inserted, unit tests passing; was writing the browser test driver.', 5185, 9347],
]
phase('Finish')
const reports = await parallel(builders.map(([pkg, where, vp, cp]) => () => agent(`${rules(vp, cp)}
YOU ARE FINISHING work package ${pkg} of spec_mature.md. Earlier engineers were cut off (API outages, a reboot, a session restart). Where the latest one stopped: ${where}
Their code is on disk: inspect your package's new src files, tagged main.js section and hooks, index.html rows, compare against the spec (§7 for your package, §3-§6 contracts, §8 ownership, §9 balance, §12) and CONTINUE: keep what is correct, finish everything missing, fix anything half-edited, run your acceptance checks in headless Chrome and tune visuals by screenshots. Do not start over or duplicate code. Return a concise report: what was there, what you added/fixed, evidence, deviations, G hooks, gaps.`, { label: 'finish ' + pkg.split(' (')[0], phase: 'Finish' })))
phase('Story')
const arc = await agent(`${rules(5180, 9342)}
YOUR JOB: implement M5 ARC phase C from spec_mature.md: integrate the raid with M4 spawnRaider, the fever herbs with M3, first kiss / rift / handfasting with M6, and the full chapter flow end to end; run it on Story difficulty in headless Chrome. Builder reports:\n${reports.map((r, i) => `--- ${builders[i][0]} ---\n${r || '(no report — inspect its code yourself)'}`).join('\n')}\nReturn a concise report.`, { label: 'M5 ARC phase C', phase: 'Story' })
const LENSES = [
  { k: 'story-mode', p: 'Mature story on Story difficulty from awaken to the end through all new chapters and every reachable choice branch, romance beats (non-explicit), music: pacing, clarity, dialogue quality, consequences applied, epilogue variants.' },
  { k: 'survivor-hardcore', p: 'Survivor and Hardcore: survival balance (§9), combat v2 vs wolves/alpha/aurochs/bear/raiders, downed + Sena rescue, permadeath + memorial, Sena death on Hardcore, every content toggle honoured, save/load mid-fight and with afflictions, old saves migrate.' },
  { k: 'visual-guardrails', p: 'Visuals: blood/wounds/dismemberment convincing (no floating limbs, decals on correct surfaces), predators/raiders look right, moodles/body screen/choice panel/notice polished at 1280x720 and 1920x1080, frame-time impact; AND verify the absolute content limits everywhere (violations = blocker).' },
]
const tester = (l, round, vp, cp, ph, extra) => agent(`${rules(vp, cp)}
YOU ARE A CRITICAL QA TESTER (round ${round}), READ-ONLY on code. Lens: ${l.p}
${extra}
Play/drive the game in headless Chrome, screenshot, judge like a professional reviewer. Report concrete reproducible issues with severity, owning area, evidence and a suggested fix. ${AREAS}`, { label: `QA r${round}:${l.k}`, phase: ph, schema: ISS })
const key = (i) => (i.area + '|' + i.title).toLowerCase().replace(/[^a-z0-9|]+/g, ' ').trim()
const seen = new Set()
const FIX = [{ a: 'gore-cmb', vp: 5174, cp: 9333 }, { a: 'arc-rom-mus', vp: 5175, cp: 9334 }, { a: 'mat-surv', vp: 5176, cp: 9335 }]
const fixRound = async (issues, round, ph) => {
  const fresh = issues.filter(i => !seen.has(key(i))); fresh.forEach(i => seen.add(key(i)))
  log(`A ${ph}: ${issues.length} reported, ${fresh.length} new`)
  if (!fresh.length) return { fresh, fixed: [] }
  const fixed = await parallel(FIX.map(f => () => {
    const mine = fresh.filter(i => i.area === f.a)
    if (!mine.length) return Promise.resolve(null)
    return agent(`${rules(f.vp, f.cp)}
YOU ARE THE FIXER for mature area "${f.a}" (round ${round}). ${AREAS} Workflow B's fixers handle weapons/sleep/first-person/world; don't touch those. Reproduce each issue first; fix every real one properly; re-test with screenshots; keep npm run build passing; run tools/test/steps/play.json at the end. Issues:\n${JSON.stringify(mine, null, 1)}\nReturn: title -> fixed / not-reproducible / deferred (reason).`, { label: `A fix r${round}:${f.a}`, phase: ph })
  }))
  return { fresh, fixed: fixed.filter(Boolean) }
}
phase('Mature QA')
const q1 = (await parallel(LENSES.map((l, i) => () => tester(l, 1, 5186 + i, 9348 + i, 'Mature QA', `ARC integration report:\n${arc}`)))).filter(Boolean).flatMap(r => r.issues)
phase('Fix')
const f1 = await fixRound(q1, 1, 'Fix')
phase('Retest')
const q2 = (await parallel(LENSES.map((l, i) => () => tester(l, 2, 5186 + i, 9348 + i, 'Retest', 'RE-TEST after fixes: confirm fixes hold; find anything still wrong or newly broken.')))).filter(Boolean).flatMap(r => r.issues)
const f2 = await fixRound(q2, 2, 'Retest')
return { reports, arc, f1, f2 }

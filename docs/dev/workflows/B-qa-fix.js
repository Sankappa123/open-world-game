export const meta = {
  name: 'hearthborn-B-weapons-sleep-qa',
  description: 'Workflow B: QA + fix weapons, sleep, first person and existing systems (5 testers, 4 fixers, retest), alongside workflow A',
  phases: [
    { title: 'QA', detail: '5 testers' },
    { title: 'Fix', detail: '4 area fixers' },
    { title: 'Retest', detail: '5 testers again + fixers' },
  ],
}
const ROOT = '/home/ashish/Desktop/game'
const SP = 'SCRATCHPAD'
const rules = (vp, cp) => `
PROJECT: ${ROOT} — Hearthborn, browser 3D survival story game (Three.js r187, Vite, plain JS), branch 'main'. The user wants a professional, polished result, "don't miss anything", as fast as possible.
READ FIRST: ${ROOT}/CLAUDE.md and ${SP}/progress.md. Specs: ${SP}/spec_ws.md (weapons WPN + rest RST), ${SP}/spec.md (expansion), ${SP}/spec_mature.md (mature; being finished by workflow A). Research: ${SP}/ws_research.json.
STATE: committed WIP checkpoint 8e37add. Done and builder-tested but NOT yet QA'd: WPN weapons (AC-style holster/draw/aim), RST cinematic sleep, FPP first person. Workflow A is finishing the mature packages (gore/survival/combat v2/story/romance/music) RIGHT NOW in the same tree — do NOT report their unfinished state and do NOT edit their sections (GORE, SURV, CMB, ARC, ROM, MUS, MAT, and files gore.js, survival.js, combat.js, enemies.js, tribe.js, arc_data.js, romance.js, music.js, mature.js) except a one-line fix if a regression they cause breaks your area (tag it).
CONTENT LIMITS (absolute): no sexual content or nudity; children never harmed; no torture.
CONCURRENCY: ~12 agents edit/test at once. Re-Read the exact region before every Edit; never rewrite/reformat others' regions; never revert others' code; if the build is broken by someone else's in-progress edit, wait 30-60 s and retry. Test against a stable snapshot: \`npx vite build --outDir ${SP}/tests/<you>/dist\` + \`npx vite preview --outDir ${SP}/tests/<you>/dist --port ${vp} --strictPort\`.
TESTING (hard): only port ${vp} for your server and ${cp} for Chrome remote debugging; NEVER 5173. Intercept ALL /api/ requests via CDP Fetch. Runner: ${ROOT}/tools/test/run.mjs (env PORT, CDP, GL="--use-angle=vulkan --enable-unsafe-swiftshader"); playthrough: ${ROOT}/tools/test/steps/play.json. Kill only your own processes at the end (by PID). Screenshots to ${SP}/shots/<you>/ — Read them and judge like a game reviewer.
No new npm deps. No git commits. \`npm run build\` must pass when you finish. Append a short section to ${SP}/progress.md.`
const ISS = { type: 'object', properties: { issues: { type: 'array', items: { type: 'object', properties: {
  title: { type: 'string' }, area: { type: 'string', enum: ['weapons-horse', 'sleep-home-story', 'fpp-world', 'save-perf'] },
  severity: { type: 'string', enum: ['blocker', 'major', 'minor', 'polish'] }, repro: { type: 'string' }, evidence: { type: 'string' }, suggested_fix: { type: 'string' } },
  required: ['title', 'area', 'severity', 'repro'] } }, summary: { type: 'string' } }, required: ['issues', 'summary'] }
const AREAS = 'Areas: weapons-horse = WPN holster/draw/grip/aim/throw/pickup/hit feedback, wolves, hunting, fishing, chopping, horses/taming/riding/mounting; sleep-home-story = RST rest/sleep, building, home, family, existing story chapters/dialogue; fpp-world = first person, world/caves/landmarks/map, visuals, HUD layout; save-perf = save/load, migration, console errors, performance.'
const KNOWN = `Known open items that must be resolved by the end (report each that still reproduces): rider arms in a stiff "steering" pose on the horse; mounting/dismounting instant (needs a short motion or blend); Echo Hollow entrance partly hidden by boulders; cave interiors too dark beyond the torch; tame horse's E prompt stealing priority from "Sit with Sena"; Lio has no map marker; Sena should sit by the hearth on New Life nights; wolves should prefer the pine forest; low frame rate (profile real hotspots); FPP: spear one-handed in first person, no look limit while seated/riding (can look straight back into Sena's face), "Your hands are empty" chip shows while holding a weapon or torch; WPN: axe head brushes the thigh in a full sprint, spear sticks straight up from the back while swimming, plain first-person forearm, help panel overlapping the lower-right corner and the FPP weapon.`
const LENSES = [
  { k: 'weapons-horse', p: 'Weapons & combat feel & horses: holster/draw/sheathe from all angles, grips, aim mode + arc + throw + pickup, hit feedback, wolves, hunting, fishing, chopping, taming, riding gaits/camera/rider pose, two-up, mount/dismount, whistle, stable.' },
  { k: 'sleep-home', p: 'Rest/sleep & home & family: rest menu (dawn/nap), rules (evening, wolves near, shelter tiers), walk-to-bed, lying poses, blanket, holding hands, camera, time-lapse sky, wake-up stretch, Sena greeting, buffs; co-op building, placeables, home upgrades, sitting by fire, hot spring, Lio.' },
  { k: 'story', p: 'Existing-story playthrough with real interactions (chapters, goals clarity, quest marker, dialogue quality/typos, cards, closeness balance, epilogue) — note the mature story chapters are being added by workflow A; focus on regressions and the parts that already exist.' },
  { k: 'fpp-world', p: 'First person everywhere (walk/sprint/sneak/jump/swim/ride/sit/build/rest, looking down, against walls/trees, settings) + world: landmarks, caves (lighting, entrances), fords/lake, map fog/markers/pins/auto-walk, day/night/storm, HUD layout at 1280x720 and 1920x1080.' },
  { k: 'save-perf', p: 'Robustness & performance: save/load at every chapter and mid-action (riding, aiming, resting, building, in cave), old-save migration (fake old saves ch 0..7 without storyV; a save shaped like the user\'s day-13 chapter-9 save), the double-start guard (no duplicated structures), console errors over a long soak with events, frame-time profiling (renderer.info, allocations), memory growth.' },
]
const tester = (l, round, vp, cp, ph) => agent(`${rules(vp, cp)}
YOU ARE A CRITICAL QA TESTER / GAME REVIEWER (round ${round}), READ-ONLY on code. Lens: ${l.p}
${round === 1 ? KNOWN : 'RE-TEST after fixes: confirm fixes hold (incl. the known items: ' + KNOWN + '); find anything still wrong or newly broken.'}
Play/drive the game in headless Chrome, screenshot, judge like a professional reviewer. Report concrete reproducible issues with severity, owning area, evidence and a suggested fix. ${AREAS}`, { label: `QA r${round}:${l.k}`, phase: ph, schema: ISS })
const key = (i) => (i.area + '|' + i.title).toLowerCase().replace(/[^a-z0-9|]+/g, ' ').trim()
const seen = new Set()
const FIX = [{ a: 'weapons-horse', vp: 5195, cp: 9357 }, { a: 'sleep-home-story', vp: 5196, cp: 9358 }, { a: 'fpp-world', vp: 5197, cp: 9359 }, { a: 'save-perf', vp: 5198, cp: 9360 }]
const fixRound = async (issues, round, ph) => {
  const fresh = issues.filter(i => !seen.has(key(i))); fresh.forEach(i => seen.add(key(i)))
  log(`B ${ph}: ${issues.length} reported, ${fresh.length} new (${fresh.filter(i => i.severity === 'blocker' || i.severity === 'major').length} blocker/major)`)
  if (!fresh.length) return { fresh, fixed: [] }
  const fixed = await parallel(FIX.map(f => () => {
    const mine = fresh.filter(i => i.area === f.a)
    if (!mine.length) return Promise.resolve(null)
    return agent(`${rules(f.vp, f.cp)}
YOU ARE THE FIXER for area "${f.a}" (round ${round}); three other fixers in this workflow handle the other areas, and workflow A handles the mature packages. ${AREAS}
Reproduce each issue first; fix every real one properly (professional quality, existing style); re-test with screenshots you inspect; keep npm run build passing; run tools/test/steps/play.json at the end for regressions. Issues:\n${JSON.stringify(mine, null, 1)}\nReturn: title -> fixed / not-reproducible / deferred (reason).`, { label: `B fix r${round}:${f.a}`, phase: ph })
  }))
  return { fresh, fixed: fixed.filter(Boolean) }
}
phase('QA')
const q1 = (await parallel(LENSES.map((l, i) => () => tester(l, 1, 5190 + i, 9352 + i, 'QA')))).filter(Boolean).flatMap(r => r.issues)
phase('Fix')
const f1 = await fixRound(q1, 1, 'Fix')
phase('Retest')
const q2 = (await parallel(LENSES.map((l, i) => () => tester(l, 2, 5190 + i, 9352 + i, 'Retest')))).filter(Boolean).flatMap(r => r.issues)
const f2 = await fixRound(q2, 2, 'Retest')
return { f1, f2 }

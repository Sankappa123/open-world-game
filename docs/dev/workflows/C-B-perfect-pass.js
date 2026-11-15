export const meta = {
  name: 'hearthborn-B-perfect',
  description: 'Workflow B, perfect pass: reference spec, fix, 3-judge visual verification loop per area, then regression and completeness check',
  phases: [
    { title: 'Reference', detail: 'one agent per area writes what correct looks like, with measurable checks' },
    { title: 'Fix', detail: 'fixer per area builds to the reference (max 4 Chromes at once)' },
    { title: 'Judge', detail: '3 independent judges per area grade fresh screenshots; loop until 2 of 3 pass' },
    { title: 'Final', detail: 'full regression and completeness critic, then a last fix pass for gaps' },
  ],
}

const ROOT = 'PROJECT_ROOT'
const SP = 'SCRATCHPAD'
const ISSUES = args.issues
const R1 = args.r1Reports || {}

const AREAS = [
  { k: 'riding', vp: 5201, cp: 9401, owns: 'horse riding: Aro rider pose, Sena two-up, mount and dismount motion, horse head and neck while ridden, weapons carried or drawn while riding, rider camera', must: `The user's own reports (see ${SP}/progress.md "USER REPORT" sections) are the top priority. Correct look: rider sits UPRIGHT in the dip just behind the withers, pelvis touching the horse's back, thighs apart around the barrel, one leg down each side, lower legs hanging along the ribs, heels slightly down; relaxed arms low near the mane or a simple rope rein; slight forward lean only at gallop; body moves with the gait. The spear never juts forward past the horse's head: carried diagonally on the back when sheathed, held low and angled down-back along the side or resting on the shoulder when drawn. Sena two-up sits astride behind Aro with her hands on his waist, legs down both sides, and no clipping. Horse head and neck are up when ridden. Mount and dismount take a short visible motion of about 0.6-0.8 s, from the horse's left side.` },
  { k: 'sitting-home', vp: 5202, cp: 9402, owns: 'every sit (Sena and Aro: fire, hearth, home bench, ground or log, hot spring), rest and sleep scenes, home and building, family and Lio, existing story chapters', must: `The user's "Sena's sitting looks bad" report is top priority. Correct look: hips on the surface, not floating, not sunk in, never on top of hot-spring water (seated in the water up to the chest). Natural knee and hip angles, hands in the lap or on the ground, facing the fire or each other, a sensible side-by-side distance, no clipping, smooth sit-down and stand-up transitions, and a camera that frames both.` },
  { k: 'fpp-hud', vp: 5203, cp: 9403, owns: 'first person (body, hands, weapon grips incl. two-handed spear, head bob, look limits when seated or riding), HUD layout, help panel, prompts, inventory chip, map markers and labels', must: 'Nothing overlaps at 1280x720 or 1920x1080: subtitles, the E prompt, chips, the weapon bar, the FPP weapon and the help hint. The first-person spear is held two-handed. Look limits apply while seated or riding.' },
  { k: 'world-caves', vp: 5204, cp: 9404, owns: 'caves (lighting beyond the torch, mouth from inside, dome gaps and specks, the Echo Hollow entrance), landmarks, terrain, biomes, the wolf pine preference on the world side', must: 'Cave interiors are readable but dark, with a torch-lit falloff and dim ambient bounce, never pitch black. No white specks or gaps. Entrances are clear and walkable. The mouth looks right from inside.' },
  { k: 'weapons', vp: 5205, cp: 9405, owns: 'weapons and combat feel outside riding: holster positions (no axe through the thigh), draw and sheathe, aim and throw and pickup, hit feedback, wolves, hunting, fishing, chopping', must: 'No weapon clips through the body at walk, sprint, sneak or swim. Grips sit in the palm. Throw arcs and pickups work.' },
  { k: 'save-perf', vp: 5206, cp: 9406, owns: 'save and load, migration, the double-start guard, asset-load retry, WebGL context loss, frame rate (draw calls, shadows, shader warm-up, auto quality on the Apple M4), memory leaks', must: 'No console errors. Context loss recovers. Auto quality picks a sensible preset on the M4. Draw calls and hitches are measurably lower (give before and after numbers). Texture count is stable over a soak.' },
]

const rules = (vp, cp) => `
PROJECT: ${ROOT}. Hearthborn is a browser 3D survival story game (Three.js r187, Vite, plain JS), on branch main. The user wants a PERFECT, professional result: judge every visual like a demanding AAA reviewer. "Better than before" is not enough; it must look right.
READ: ${SP}/progress.md (especially the USER REPORT, RESUME and REVIEW NOTE sections), ${SP}/spec_ws.md and ${SP}/spec.md as needed. Round-1 fixer reports: ${SP}/perfect/r1_reports.json.
MACHINE: fanless M4 MacBook Air, 16 GB RAM. At most ONE headless Chrome and ONE preview server per agent; close them (kill by PID) as soon as each run ends.
TESTING (hard): use only port ${vp} and Chrome debugging port ${cp}; NEVER 5173 (the user's real save). Intercept ALL /api/ requests via CDP Fetch. Runner: ${ROOT}/tools/test/run.mjs (env PORT, CDP, GL="--use-angle=metal"). Test against a snapshot: npx vite build --outDir ${SP}/perfect/<area>/dist, then npx vite preview --outDir ... --port ${vp} --strictPort.
CONCURRENCY: up to 6 fixers edit the same tree. Edit only your area's code and tag it; re-Read the region before every Edit; never revert others' code; if the build breaks from someone else's edit, wait 30-60 s and retry.
CONTENT LIMITS (absolute): no sexual content or nudity; children never harmed; no torture.
No new npm deps. No git commits. npm run build must pass when you finish. Append a short section to ${SP}/progress.md.`

const VERDICT = { type: 'object', properties: {
  pass: { type: 'boolean' }, score: { type: 'number', description: '1-10 against the reference checklist' },
  defects: { type: 'array', items: { type: 'object', properties: {
    what: { type: 'string' }, shot: { type: 'string' }, expected: { type: 'string' }, severity: { type: 'string', enum: ['blocker', 'major', 'minor'] } },
    required: ['what', 'expected', 'severity'] } },
  checklist: { type: 'array', items: { type: 'object', properties: { item: { type: 'string' }, ok: { type: 'boolean' }, note: { type: 'string' } }, required: ['item', 'ok'] } },
  summary: { type: 'string' } },
  required: ['pass', 'score', 'defects', 'summary'] }

// at most 4 fixers drive Chrome at once on the Air
let slots = 4; const waiters = []
const acquire = () => slots > 0 ? (slots--, Promise.resolve()) : new Promise(r => waiters.push(r))
const release = () => { const w = waiters.shift(); if (w) w(); else slots++ }
const withSlot = async (fn) => { await acquire(); try { return await fn() } finally { release() } }

const LENSES = [
  { k: 'realism', p: 'REALISM and ANATOMY lens: body proportions, joint angles, contact with surfaces (seat, ground, water), weight, clipping, believable motion. Compare against the reference measurements.' },
  { k: 'reviewer', p: 'GAME REVIEWER and UX lens: would a demanding player or critic call this polished? Readability, camera framing, prompts, overlaps, feel, and consistency with the rest of the game.' },
  { k: 'regression', p: 'TECHNICAL and REGRESSION lens: inspect the code diff for this area (git diff e23ed03 -- the relevant files) and the shoot script. Check that the shots come from real gameplay paths via G hooks, not test-only hacks; that each issue is actually fixed in code; that there are no side effects on other systems; and that npm run build passes.' },
]

const MAX_ROUNDS = 4
phase('Reference')
const results = await pipeline(AREAS,
  // 1. reference spec, independent of the fixer
  (a) => agent(`${rules(a.vp, a.cp)}
YOU WRITE THE REFERENCE for area "${a.k}" (${a.owns}). You do NOT edit game code.
Goal: a precise, checkable description of what CORRECT looks and behaves like, so independent judges can grade screenshots objectively.
1. Research how it should look: use WebSearch and WebFetch for real-world references (for example, correct bareback and two-up riding posture, seated postures, cave lighting in good games) and summarise the key visual facts in words. Do not copy any game's assets or look.
2. Inspect the actual assets and rig (${ROOT}/src/people.js, the UAL clips and bones in public/models, the horse model's dimensions) so your numbers fit THIS game: for example, pelvis height relative to the horse's back in metres, knee and hip angles in degrees, spear angle limits.
3. Required baseline facts: ${a.must}
4. Define the exact SHOT LIST the fixer must produce (names, camera angle, state set up via G hooks, resolution 1280x720), covering every issue below.
Issues for this area:\n${JSON.stringify(ISSUES[a.k] || [], null, 1)}
Write it all to ${SP}/perfect/${a.k}/reference.md: the facts, a numbered acceptance checklist (each item pass/fail-checkable from screenshots or code), the shot list, and the issue list. Return the checklist as plain text.`, { label: `ref:${a.k}`, phase: 'Reference' }),

  // 2. fix -> judge loop until 2 of 3 judges pass
  async (refText, a) => {
    let feedback = '', last = null, history = []
    for (let round = 1; round <= MAX_ROUNDS; round++) {
      const fix = await withSlot(() => agent(`${rules(a.vp, a.cp)}
YOU ARE THE FIXER for area "${a.k}" (${a.owns}), round ${round} of up to ${MAX_ROUNDS}.
The reference and acceptance checklist are in ${SP}/perfect/${a.k}/reference.md. Read it first; it is the standard you are graded against by 3 independent judges.
Earlier work is already in the tree (commits ce50a88..e23ed03 plus uncommitted edits); see what changed with git diff. Round-1 fixer report for your area is in ${SP}/perfect/r1_reports.json. Keep what is correct, replace what is wrong.
${feedback ? 'JUDGES REJECTED THE PREVIOUS ROUND. Fix every defect below; do not argue them away:\n' + feedback : 'Fix every issue and checklist item properly.'}
Before you finish:
(a) Write or update ${SP}/perfect/${a.k}/shoot.mjs. It must build nothing itself; it drives the preview on port ${a.vp} via CDP and reproduces EVERY shot in the reference shot list from a fresh page load using only G hooks and real input, saving to ${SP}/perfect/${a.k}/shots/r${round}/.
(b) Rebuild the snapshot, run shoot.mjs, and Read every shot yourself; iterate until YOU would pass it against the checklist.
(c) npm run build passes; for gameplay areas, also run tools/test/steps/play.json once for regressions.
Return: each checklist item -> done, with evidence (shot name or numbers); anything deferred, with the reason; and the shot folder path.`, { label: `fix r${round}:${a.k}`, phase: 'Fix' }))

      const verdicts = (await parallel(LENSES.map(l => () => agent(`${rules(a.vp + 50, a.cp + 50)}
YOU ARE AN INDEPENDENT JUDGE for area "${a.k}", round ${round}. You are READ-ONLY: never edit game code. ${l.p}
Standard: ${SP}/perfect/${a.k}/reference.md (facts, checklist, shot list). Shots: ${SP}/perfect/${a.k}/shots/r${round}/ (made by ${SP}/perfect/${a.k}/shoot.mjs). If shots are missing or don't cover the shot list, that is a FAIL.
Read EVERY shot carefully at full size. Grade each checklist item ok or not ok. Be strict and specific: pass only if a demanding player would see nothing wrong. Default to pass=false when in doubt.
Fixer's claims (verify them; don't trust them):\n${String(fix || '(fixer returned nothing)').slice(0, 6000)}`, { label: `judge r${round}:${a.k}:${l.k}`, phase: 'Judge', schema: VERDICT })))).filter(Boolean)

      const passes = verdicts.filter(v => v.pass).length
      history.push({ round, passes, scores: verdicts.map(v => v.score) })
      log(`${a.k} round ${round}: ${passes}/3 judges pass, scores ${verdicts.map(v => v.score).join('/')}`)
      last = { fix, verdicts }
      if (passes >= 2 && verdicts.every(v => !v.defects.some(d => d.severity === 'blocker'))) return { area: a.k, status: 'passed', round, history, last }
      feedback = verdicts.flatMap(v => v.defects.map(d => `- [${d.severity}] ${d.what}${d.shot ? ' (' + d.shot + ')' : ''} -> expected: ${d.expected}`)).join('\n')
    }
    return { area: a.k, status: 'not-passed-after-max-rounds', history, last, open: feedback }
  })

phase('Final')
const summary = results.filter(Boolean).map(r => `${r.area}: ${r.status} ${JSON.stringify(r.history)}${r.open ? '\nOPEN:\n' + r.open : ''}`).join('\n\n')
const critic = await agent(`${rules(5210, 9410)}
YOU ARE THE FINAL REGRESSION AND COMPLETENESS CRITIC (read-only on game code).
1. npm run build. Then run the full tools/test/steps/play.json playthrough and a 5-minute soak, and report any console errors or regressions.
2. For every issue in ${SP}/perfect_issues.json (80 issues) and every USER REPORT item in progress.md, decide: fixed (with evidence: a shot in ${SP}/perfect/*/shots or code) or NOT fixed.
3. Take your own fresh screenshots of the riding (side, three-quarter, front, with Sena two-up and spear drawn) and of Sena sitting at the fire and in the hot spring, and judge them against ${SP}/perfect/riding/reference.md and ${SP}/perfect/sitting-home/reference.md.
Area results so far:\n${summary}
Return every gap (empty list if none).`, { label: 'final critic', phase: 'Final', schema: { type: 'object', properties: { gaps: { type: 'array', items: { type: 'object', properties: { area: { type: 'string', enum: AREAS.map(a => a.k) }, what: { type: 'string' }, evidence: { type: 'string' } }, required: ['area', 'what'] } }, regression: { type: 'string' }, summary: { type: 'string' } }, required: ['gaps', 'summary'] } })

const gaps = (critic && critic.gaps) || []
const gapAreas = AREAS.filter(a => gaps.some(g => g.area === a.k))
const finalFixes = await parallel(gapAreas.map(a => () => withSlot(() => agent(`${rules(a.vp, a.cp)}
YOU ARE THE FINAL FIXER for area "${a.k}". The final critic found these gaps in your area:\n${JSON.stringify(gaps.filter(g => g.area === a.k), null, 1)}
Fix them to the standard in ${SP}/perfect/${a.k}/reference.md. Re-run ${SP}/perfect/${a.k}/shoot.mjs into shots/final/ and Read every shot. npm run build must pass. Return what you fixed, with evidence.`, { label: `final fix:${a.k}`, phase: 'Final' }))))
log(`final fixes run for: ${gapAreas.map(a => a.k).join(', ') || 'none'}`)
return { summary, critic, finalFixes }

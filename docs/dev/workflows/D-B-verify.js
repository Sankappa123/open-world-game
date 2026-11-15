export const meta = {
  name: 'hearthborn-B-verify',
  description: 'Independently verify workflow B against the user reports and all retest issues; fix any failures and re-verify (max 2 loops)',
  phases: [
    { title: 'Verify', detail: '4 independent read-only verifiers, fresh screenshots' },
    { title: 'Fix', detail: 'fix only what verification failed' },
    { title: 'Re-verify', detail: 'confirm the failures are fixed' },
  ],
}
const ROOT = 'PROJECT_ROOT'
const SP = 'SCRATCHPAD'
const rules = (vp, cp) => `
PROJECT: ${ROOT}, Hearthborn (Three.js browser game), on branch main at commit fb631b2 (workflow B rounds 1 and 2 done). The user wants B finished PERFECTLY: judge like a demanding player and reviewer.
READ FIRST: ${ROOT}/docs/dev/user-reports.md (the user's own reports: TOP priority), ${SP}/progress.md (REVIEW NOTE sections), the round-2 issue list ${SP}/r2_issues.json, and the fixer reports ${SP}/r2_reports.json.
MACHINE: M4 MacBook Air, often under load. Use ONE headless Chrome and ONE preview server; close both (kill by PID) when done.
TESTING (hard): only port ${vp} and Chrome debugging port ${cp}; NEVER 5173 (the user's real save). Intercept ALL /api/ requests via CDP Fetch. Runner: ${ROOT}/tools/test/run.mjs (env PORT, CDP, GL="--use-angle=metal"). Snapshot: npx vite build --outDir ${SP}/verify/<area>/dist, then npx vite preview --outDir ... --port ${vp} --strictPort. Screenshots to ${SP}/verify/<area>/; Read every one at full size.
CONTENT LIMITS (absolute): no sexual content or nudity; children never harmed; no torture.
No new npm deps. No git commits.`
const V = { type: 'object', properties: {
  items: { type: 'array', items: { type: 'object', properties: {
    item: { type: 'string' }, source: { type: 'string', description: 'user-report | review-note | r2-issue' },
    verdict: { type: 'string', enum: ['pass', 'fail'] }, evidence: { type: 'string', description: 'screenshot path or measured numbers' }, problem: { type: 'string' } },
    required: ['item', 'verdict', 'evidence'] } },
  newProblems: { type: 'array', items: { type: 'object', properties: { what: { type: 'string' }, severity: { type: 'string', enum: ['blocker', 'major', 'minor'] }, evidence: { type: 'string' } }, required: ['what', 'severity'] } },
  summary: { type: 'string' } },
  required: ['items', 'newProblems', 'summary'] }
const AREAS = [
  { k: 'riding', vp: 5211, cp: 9411, scope: 'Riding and horses: every point of the USER REPORT "riding pose" and the Sena-on-the-horse part of "Sena\'s sitting"; the REVIEW NOTE riding points (spear never ahead of the horse, seat height and pelvis contact, gallop legs and rider motion, the axe near Sena\'s leg); mount and dismount motion with no clipping through the flank; the horse not wandering off after dismount or whistle; first-person riding view; plus every weapons-horse item in r2_issues.json. Shoot side, front, three-quarter and back views at idle, walk, trot and gallop, with Sena two-up, the spear sheathed and drawn, mid-mount and mid-dismount, and first person.' },
  { k: 'sitting-home', vp: 5212, cp: 9412, scope: 'Sitting and home: every point of the USER REPORT "Sena\'s sitting" (fire, hearth, bench or log, ground, hot spring: hips on the surface, never on the water, natural pose, no clipping, smooth transitions, camera framing); E to stand up does not sit you back down; the sleeping blanket shape (no lumpy box, no feet through it); epilogue villagers not walking through walls; plus every sleep-home-story item in r2_issues.json.' },
  { k: 'fpp-hud-world', vp: 5213, cp: 9413, scope: 'First person, HUD and world: no overlaps at 1280x720 and 1920x1080 (subtitles, E prompt, inventory, weapon bar, the F1 hint, the first-person weapon); the first-person spear two-handed with a visible head; the day counter advances; caves readable past the torch with no specks; the torch flames; plus every fpp-world item in r2_issues.json. Note: the brick ruins and house style is deliberately deferred to the designer (Deril); do not fail it, just note it.' },
  { k: 'save-perf-regression', vp: 5214, cp: 9414, scope: 'Save, performance and regressions: a slow or empty first save request never hides Continue or deletes a save (simulate a delayed /api/save); every chapter save and a save shaped like docs/dev/user-save.json load with ZERO exceptions (including the old wS[e] structure crash); the full tools/test/steps/play.json playthrough passes; a 5-minute soak with no console errors and a stable texture count; frame rate and draw calls versus before (give numbers); plus every save-perf item in r2_issues.json. Also confirm server/db.mjs still routes only port 5173 (or HB_SAVE_PORTS) to the real database.' },
]
const verify = (a, round, ph) => agent(`${rules(a.vp, a.cp)}
YOU ARE AN INDEPENDENT VERIFIER (round ${round}), READ-ONLY on game code. Do not trust the fixers' claims; check each item yourself with fresh screenshots or measurements.
SCOPE: ${a.scope}
For EVERY item give pass or fail with evidence. Pass only if a demanding player would see nothing wrong. When in doubt, fail. Also list any NEW problems you notice.`, { label: `verify r${round}:${a.k}`, phase: ph, schema: V })

phase('Verify')
const results = await pipeline(AREAS,
  (a) => verify(a, 1, 'Verify'),
  async (v1, a) => {
    if (!v1) return { area: a.k, status: 'verifier failed to return' }
    let fails = v1.items.filter(i => i.verdict === 'fail'), news = v1.newProblems.filter(p => p.severity !== 'minor')
    log(`${a.k}: ${v1.items.length - fails.length}/${v1.items.length} pass, ${news.length} new major/blocker`)
    let last = v1, round = 1
    while ((fails.length || news.length) && round < 3) {
      round++
      await agent(`${rules(a.vp, a.cp)}
YOU ARE THE FIXER for "${a.k}". An independent verifier FAILED these items. Fix every one properly (professional quality, existing style, tag your edits), re-shoot the same views and Read them, keep npm run build passing, and run tools/test/steps/play.json once.
FAILED:\n${JSON.stringify(fails, null, 1)}\nNEW PROBLEMS:\n${JSON.stringify(news, null, 1)}
Return each item: fixed (with evidence) or cannot fix (with the reason).`, { label: `fix r${round}:${a.k}`, phase: 'Fix' })
      last = await verify(a, round, 'Re-verify')
      if (!last) break
      fails = last.items.filter(i => i.verdict === 'fail'); news = last.newProblems.filter(p => p.severity !== 'minor')
      log(`${a.k} re-verify: ${last.items.length - fails.length}/${last.items.length} pass, ${news.length} new major/blocker`)
    }
    return { area: a.k, rounds: round, passed: !(fails.length || news.length), fails, news, summary: last && last.summary, total: last && last.items.length }
  })
return results
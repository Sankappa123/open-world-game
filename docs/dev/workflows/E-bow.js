export const meta = {
  name: 'hearthborn-bow',
  description: 'Build the bow & arrows (side quest after the cave) in the bow worktree, then judge with fresh screenshots and fix until pass',
  phases: [
    { title: 'Build core', detail: 'bow/quiver/arrow models, items, controls, flight, hits, recovery, save' },
    { title: 'Build FPP + story', detail: 'first-person view model; side quest + tests (parallel, separate modules)' },
    { title: 'Checkpoint', detail: 'commit on branch bow' },
    { title: 'Verify', detail: '3 independent judges, fresh screenshots' },
    { title: 'Fix', detail: 'fix only what the judges failed' },
    { title: 'Re-verify', detail: 'confirm fixes' },
  ],
}
const WT = '/home/ashish/Desktop/hearthborn-bow'
const rules = (vp, cp) => `
PROJECT: Hearthborn (Three.js r187 + Vite browser game). WORK ONLY IN THE WORKTREE ${WT} (git branch "bow"). NEVER edit /home/ashish/Desktop/game (the user is playing from it on port 5173).
SPEC (read fully first): ${WT}/docs/dev/spec-bow.md. Project notes: ${WT}/CLAUDE.md (code map, section tags).
YOUR PORTS: vite ${vp}, Chrome debugging ${cp}. Never 5173. Start vite with: cd ${WT} && npx vite --port ${vp} --strictPort (background). Drive with: cd ${WT} && PORT=${vp} CDP=${cp} node tools/test/run.mjs <outDir> <steps.json> (it intercepts all /api/). Put outputs under /tmp/hb-bow/<your-label>/. One Chrome at a time; kill your vite and Chrome by PID when done.
MACHINE: ThinkPad, 8 threads, Intel UHD 620, SwiftShader headless (slow): be patient, use generous waits.
QUALITY: the user wants professional, complete, polished results. Read every screenshot at full size before claiming a visual is right.
CONTENT LIMITS (absolute): arrows never harm children, Sena, villagers or the horse; no sexual content; no torture.
Tag every edit "BOW". No new npm deps. Keep npm run build passing.`

phase('Build core')
const core = await agent(`${rules(5221, 9421)}
YOU ARE THE CORE BUILDER. Implement spec sections 2, 3, 4 and 7 (third person): src/bow.js (procedural self-bow with a string that bends to the drawing hand, quiver with fletchings, pooled arrow meshes), items/recipes/HUD chips, Digit5 + Q integration in the WPN system, the third-person draw/hold/loose pose (bone overrides + IK in the style of wpnAimPose; left arm out at the grip, right hand to the cheek, torso side-on), aim camera/crosshair/arc via aimSolve, arrow flight, hits through the existing pipeline (wpnHitFx / animalHit / GORE / CMB), never hitting friendlies, sticking/breaking/water loss, E pickup and carcass recovery, loose arrows saved/restored, sounds, F1 help, save defaults for old saves. Leave clean hooks for two follow-up agents: (a) first-person view model in src/bow_fpp.js (export what it needs: draw charge, state, string/arrow geometry helpers), (b) the side quest in src/bow_story.js (emit events: crafted bow/quiver/arrows, hit at distance d on target kind, deer killed by arrow, arrows picked up). Provide window.G.bow test hooks. Shoot third-person screenshots (side, front-3/4, back; sheathed, drawing, full draw, just loosed; arrows stuck in a deer, a tree and the ground) and iterate until they look right. Run tools/test/steps/play.json once to confirm no regressions.
When done: cd ${WT} && git add -A src tools docs public index.html && git commit -m "BOW: core bow, arrows, flight, hits, recovery" (append a blank line and "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"). Do NOT add node_modules.
Return a concise report: files, hooks/exports for the next agents, the G.bow API, known gaps, screenshot paths.`, { label: 'build:core', phase: 'Build core' })

phase('Build FPP + story')
const [fpp, story] = await parallel([
  () => agent(`${rules(5222, 9422)}
YOU ARE THE FIRST-PERSON BUILDER. Implement spec section 6 in src/bow_fpp.js with only small tagged hooks in main.js (another agent is editing src/bow_story.js and quest code in main.js in parallel: do not touch quest/story code; if the Edit tool says main.js changed, re-read and retry). The core builder's report:\n${core}\n
Requirements: bow held out in the left hand at the grip, canted slightly; right hand draws the string to the cheek; arrow nocked and animates with the draw; release snaps the string; natural wrists; the crosshair always fully visible (measure it: no bow/hand/arrow pixels within 40 px of screen centre at 1280x720 and 1920x1080 during draw and full draw); hides when sheathed/swimming/riding; comfort settings respected. Screenshot idle-drawn, drawing, full draw, just loosed, walking with it, looking up and down, at both resolutions; iterate until it looks professional.
Do not commit. Return a concise report with screenshot paths and anything left open.`, { label: 'build:fpp', phase: 'Build FPP + story' }),
  () => agent(`${rules(5223, 9423)}
YOU ARE THE STORY + TESTS BUILDER. Implement spec section 5 in src/bow_story.js with small tagged hooks in main.js (another agent is editing first-person view-model code in parallel: do not touch it; if the Edit tool says main.js changed, re-read and retry). The core builder's report:\n${core}\n
Requirements: the unlock after the cave chapter, Sena's offer lines (natural, in the game's voice), the "Side: The Hunter's Bow" quest block under the chapter goals (also visible in the epilogue free play until done), the 6 goals, completion reward, S.bowQ saved; old saves past the cave get the quest on load with zero exceptions (test tools/test/steps/old.json and docs/dev/user-save.json shaped saves if present, and a mid-story save). Write tools/test/steps/bow.json: the full quest end to end with G hooks and real key/mouse input, including save + reload with loose arrows restored and expects for every goal. Run bow.json and play.json; both must pass. Screenshot the quest panel at 1280x720 and 1920x1080 (no overlaps with subtitles, prompts or inventory).
Do not commit. Return a concise report with test outputs and screenshot paths.`, { label: 'build:story', phase: 'Build FPP + story' }),
])

phase('Checkpoint')
const commit = (msg, ph) => agent(`In ${WT} (git branch "bow"): run npm run build (must pass; if it fails, report the error and do not commit). Then git add -A src tools docs public index.html (never node_modules) and commit with message "${msg}" followed by a blank line and "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>". If nothing changed, skip. Return the commit hash or the reason.`, { label: 'commit', phase: ph, effort: 'low' })
await commit('BOW: first-person bow view model, Hunter\'s Bow side quest, bow.json test', 'Checkpoint')

const V = { type: 'object', properties: {
  items: { type: 'array', items: { type: 'object', properties: {
    item: { type: 'string' }, verdict: { type: 'string', enum: ['pass', 'fail'] }, evidence: { type: 'string' }, problem: { type: 'string' } }, required: ['item', 'verdict', 'evidence'] } },
  newProblems: { type: 'array', items: { type: 'object', properties: { what: { type: 'string' }, severity: { type: 'string', enum: ['blocker', 'major', 'minor'] }, evidence: { type: 'string' } }, required: ['what', 'severity'] } },
  summary: { type: 'string' } }, required: ['items', 'newProblems', 'summary'] }
const AREAS = [
  { k: 'tpp-feel', vp: 5231, cp: 9431, scope: 'Third person look and feel (spec 1-4): bow/quiver/spear/axe carry with zero clipping from every side; draw, full-draw, hold-shake and loose poses (arms, grip, string to the cheek, torso side-on) at idle and while strafing; the string bending; arrow flight arc matches the preview; arrows sticking at the right depth/angle in deer, wolf, tree, ground, structures; stone breaks; water loss; damage numbers vs spec (deer 1-2, wolf 2); headshot bonus; hitstop/shake/sound hooks called; friendlies (Sena, Lio, villagers, horse) never damaged; E pickup and capacity limits; bow put away on mount/swim/sit/rest.' },
  { k: 'fpp-hud', vp: 5232, cp: 9432, scope: 'First person and HUD (spec 3, 6): the view model at idle, drawing, full draw, loosed, walking, looking up/down at 1280x720 and 1920x1080; the crosshair fully clear (measure pixels within 40 px of centre); natural wrists; the string and nocked arrow animate; hides when sheathed/swimming/riding; HUD chips "Bow · n arrows", crafting menu entries, F1 list, No-arrows and Quiver-full messages; no overlaps among subtitles, E prompt, inventory, quest panel and weapon bar.' },
  { k: 'story-save', vp: 5233, cp: 9433, scope: 'Story, saves and regressions (spec 5, 7): the quest unlocks only after the cave chapter; Sena\'s offer lines read naturally; the side-quest block, ticks and completion reward; chapter progress unaffected; old saves (tools/test/steps/old.json, docs/dev/user-save.json shape, a mid-story chapter-15 save) load with zero exceptions and get the quest; loose arrows and quest state survive save/reload; tools/test/steps/bow.json and play.json both pass; npm run build passes; frame rate/draw calls with 40 loose arrows vs without (give numbers); no console errors in a 3-minute soak with the bow in use.' },
]
const verify = (a, round, ph) => agent(`${rules(a.vp, a.cp)}
YOU ARE AN INDEPENDENT JUDGE (round ${round}), READ-ONLY on game code (you may write test step files under /tmp/hb-bow/). Do not trust any builder's claims; check everything yourself against the spec with fresh screenshots and measurements.
SCOPE: ${a.scope}
For EVERY item give pass or fail with evidence (screenshot path or numbers). Pass only if a demanding player would see nothing wrong. When in doubt, fail. Also list NEW problems you notice (anything the bow broke elsewhere counts).`, { label: `verify r${round}:${a.k}`, phase: ph, schema: V })

const results = await pipeline(AREAS,
  (a) => verify(a, 1, 'Verify'),
  async (v1, a) => {
    if (!v1) return { area: a.k, status: 'judge failed to return' }
    let fails = v1.items.filter(i => i.verdict === 'fail'), news = v1.newProblems.filter(p => p.severity !== 'minor')
    log(`${a.k}: ${v1.items.length - fails.length}/${v1.items.length} pass, ${news.length} new major/blocker`)
    let last = v1, round = 1
    while ((fails.length || news.length) && round < 4) {
      round++
      await agent(`${rules(a.vp, a.cp)}
YOU ARE THE FIXER for "${a.k}". An independent judge FAILED these items. Fix every one properly (professional quality, existing style, BOW tags). Other fixers work on other areas in parallel: stay in your area; if the Edit tool says a file changed, re-read and retry. Re-shoot the same views and Read them, keep npm run build passing, and run tools/test/steps/bow.json once.
FAILED:\n${JSON.stringify(fails, null, 1)}\nNEW PROBLEMS:\n${JSON.stringify(news, null, 1)}
Do not commit. Return each item: fixed (with evidence) or cannot fix (with the reason).`, { label: `fix r${round}:${a.k}`, phase: 'Fix' })
      last = await verify(a, round, 'Re-verify')
      if (!last) break
      fails = last.items.filter(i => i.verdict === 'fail'); news = last.newProblems.filter(p => p.severity !== 'minor')
      log(`${a.k} re-verify r${round}: ${last.items.length - fails.length}/${last.items.length} pass, ${news.length} new major/blocker`)
    }
    return { area: a.k, rounds: round, passed: !(fails.length || news.length), fails, news, minor: last && last.newProblems.filter(p => p.severity === 'minor'), summary: last && last.summary, total: last && last.items.length }
  })

phase('Checkpoint')
const c2 = await commit('BOW: judge fixes (verify loop)', 'Checkpoint')
return { core, fpp, story, results, commit: c2 }

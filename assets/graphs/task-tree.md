# sync-dsh — Chain-of-Thought task tree

For each phase: the question the agent asks itself, the check it runs, and the branch it takes. Walk this
top-to-bottom, ONE task at a time, never ending the turn mid-run (`references/self-management.md`).

```
run
└─ 00 bootstrap
   Q: does .design-sync/ exist?
   check: ls .design-sync/STATE.json
   ├─ no  → node ods-init.js --project <name>  → node ods-status.js  → enter loop
   └─ yes → node ods-status.js  → jump to the next unchecked task

└─ 01 detect
   Q: what stack / theme / nav / effects does this repo use?
   check: node ods-detect.js --root <repo> --out signals.json ; JSON parses, stack non-empty
   ├─ known stack   → carry signals.json forward
   └─ unknown       → record `stack:unknown`, still proceed (extractor will adapt)

└─ 02 extract
   Q: what are the light AND dark tokens?
   check: node ods-extract-tokens.js --root --signals --out ; both light.color & dark.color non-empty
   ├─ standard source (css-vars / token-file / @theme) → tokens.json
   ├─ no dark variant                                  → dark = light (both keys still emitted)
   └─ ambiguous source (scss / theme.ts / inline)      → dispatch sync-dsh-extractor, use its {light,dark} JSON

└─ 03 design-system
   Q: does DESIGN.md carry all four capabilities + a theme mechanism?
   check: node ods-build-design-system.js --id --tokens --config ; DESIGN.md has Color/Links/Navigation/Effects/Theme, Theme section agrees with tokens.json
   ├─ all sections present → note "reload OD to see DS in picker"
   └─ a section missing    → NOT done, re-run

└─ 04 project (agent/MCP, not a script)
   Q: which OD project does this repo sync to, and is it pinned?
   check: settle per precedence (pinned → fresh → re-adopted) ; projectId pinned in config.json ;
          .design-sync/.cache/od-project.json holds projectId/resolvedDir/previewUrl/rawBase
   ├─ pinned + cached → carry rawBase forward to build
   └─ facts missing   → cannot proceed; call get_project again (never guess resolvedDir)

└─ 05 build
   Q: does od-bundle/ carry every page with the marker, plus sentinel + anchor sidecar?
   check: stage scripts → .ds-sync/ ; node .ds-sync/ods-build.js --config .design-sync/config.json
          --root <repo> --out ./od-bundle --base <rawBase>
   ├─ @odsCard on every page, sentinel, _ods_sync.json sidecar, .ods-build-meta.json → continue
   └─ anything missing → fix config/source, re-run build

└─ 06 pull (only on OD-side drift)
   Q: did a designer edit in OD that source lacks?
   check: node .ds-sync/ods-pull.js --od <odFile> --src <srcFile> --name <block>  (exit 2 = review diff)
   ├─ user accepts the diff → re-run with --apply (managed block only, human text intact)
   └─ no od drift          → skip

└─ 07 validate
   Q: do links / nav / effects / theme / od-safe hold on every page?
   check: node .ds-sync/ods-validate.js ./od-bundle --config .design-sync/config.json ;
          exit 0, .render-check.json shows bad: 0
   ├─ exit 0  → continue to grade
   └─ a [TAG] → fix the phase the tag names (never hand-edit HTML to pass), rebuild, re-validate (≤3)

└─ 08 grade
   Q: is every page good in BOTH light and dark cells?
   check: node .ds-sync/ods-capture.js --out ./od-bundle ; grade what it prints as pending
   ├─ all cells good, no [LEARNINGS_UNMERGED]  → continue
   └─ needs-work / learnings pending → fold learnings into NOTES.md, fix config/source,
                                       driver rebuild, re-capture

└─ 09 upload-sync (driver → plan → agent MCP → verify → manifest)
   Q: did the final driver run pass, and does the remote now match?
   check: node .ds-sync/ods-resync.js --config .design-sync/config.json --root . --out ./od-bundle
          [--remote .design-sync/.cache/remote-sync.json] ; verdict ok:true
   ├─ upload.any:false → nothing ships; close-out only
   ├─ ok:true → node .ds-sync/ods-upload-plan.js --out ./od-bundle
   │            → agent executes the plan over OD MCP (sentinel → content → deletes → re-arm → anchor LAST)
   │            → list_files → node .ds-sync/ods-upload-verify.js --plan … --remote …  (exit 0)
   │            → ods-manifest.js add pairs → ods-manifest.js drift prints clean → DONE
   ├─ uncleared failure mid-upload → STOP: no re-arm, no anchor; fix, re-run the driver
   └─ later drift: src:true → driver re-run ; od:true → 06-pull review gate ; both → user picks winner
```

DONE condition for the whole run: every box `[x]`, the session's FINAL driver run (`ods-resync.js`)
printed a verdict with `ok:true`, `ods-upload-verify.js` exited 0, and `ods-manifest.js drift` prints
`clean`.

# Verification — 29 October 2026

The new judge-facing features were verified using isolated databases and the installed Microsoft Edge browser.

| Check | Result |
|---|---|
| Backend regression suite | 42 passed |
| Browser workflow suite | 9 passed; 1 opt-in live Gemini test skipped |
| Next.js production build | Passed, including TypeScript |
| Eight ReviewGuard challenge scenarios | 33 / 33 expected review states matched |
| Challenge false / missed reopenings | 0 / 0 within these scripted scenarios |
| Generated evidence package | 8 manifest-listed files checked; 22 aggregate snapshots replayed |
| Pitch PDF | 7 slides; programmatic footer-overlap check passed; results slide visually inspected |
| Separate actual Gemini review at 70% | Passed: 3 fields, 6 proposals, 2 automatically applied, 4 unresolved/pending, 2,123 reported tokens |

Commands: `.\.venv\Scripts\python.exe -m pytest -q`, `npm run build`, `npm run test:e2e -- --reporter=list,html`, `.\.venv\Scripts\python.exe tools/build_pitch.py`, and `node scripts/render-pitch.cjs` from `web` for PDF rendering.

Backend tests specifically check non-mutating sensitivity and challenge endpoints, rejected-checksum ablations, duplicate-signal caps, irrelevant-change preservation, renamed-field identity, baseline behavior, score replay and altered-package detection. Browser tests exercise the new controls and downloads along with the existing upload/review/rescan/preview/save/export workflow and responsive layouts.

The backend emits one existing Starlette/httpx test-client deprecation warning. The standard browser suite skips the opt-in live test; a separate actual Gemini screenshot test verified the 70% review and subsequent acceptance/rejection/revocation/rescan actions. Its first connection failure is preserved in the review documentation. Threshold tests establish inclusive 70% behavior, below-threshold preservation and unchanged missing-metadata checks. Automated software checks and developer-authored synthetic detection results are distinct from the independently human-labelled evaluation still required for submission.

# اطلس متروی تهران · Tehran Metro Atlas

An independent bilingual geographical atlas of Tehran's passenger railway and its development. Open the [Persian map](https://sinatabar.github.io/tehran-metro-atlas/) or [English map](https://sinatabar.github.io/tehran-metro-atlas/en/). The site is unaffiliated with Tehran Metro and Tehran Municipality.

اطلس مستقل متروی تهران برای بررسی خطوط فعال، ایستگاه‌های تقاطعی، انشعاب‌های حومه و طرح‌های آینده است. برای دیدن وضعیت و منبع، یک ایستگاه یا خط را انتخاب کنید. طرح‌های دارای اطلاعات مکانی ناکافی در فهرست نگهداری می‌شوند. جست‌وجوی یک محله، ایستگاه‌های دارای مختصات در نزدیکی نقطهٔ مرجع آن را نشان می‌دهد.

## Release scope

The 24 November 2026 release reconciles seven operating line numbers, nine service patterns, 145 physical operating stations and 155 consecutive passenger segments. Its development inventory includes Lines 8–11, extensions, express rail, suburban connections and light rail. Positions for 35 future station records remain unknown. The [research inventory](docs/RESEARCH.md) documents source disagreements, prospective service at existing stations and the difference between the municipal headline count and distinct passenger facilities. Real-time disruptions are outside the dataset.

Users can inspect source evidence, search in either script, switch map themes, select individual lines, filter by construction and geographic uncertainty, share map positions and download GIS files. The **Get data** panel can save the map and directory for offline use in supported browsers. The local basemap, fonts, workers and gazetteer have no external runtime service dependency.

## Run locally

Requirements are Node 24+, npm and Python 3.9+. The reviewed snapshot and GIS exports are included.

```sh
npm ci
python3 scripts/build.py --check
npm run dev
```

Vite reports the local URL. To build and serve the production release, including all prerendered pages, run the following.

```sh
npm run build
npm run preview
```

## Validate

```sh
python3 -m unittest discover -s tests/data
python3 scripts/build.py --check
npm test
npm run build
npx playwright install chromium firefox webkit
npm run test:e2e
```

For independent GIS checks, use Python 3.11+ in an isolated environment. This verification also audits every station-to-station edge against the raw cited OSM ways.

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r scripts/osm-requirements.txt
.venv/bin/python scripts/check_gis.py
.venv/bin/python scripts/osm_verify.py data/raw/osm/2026-11-23 data/reviewed/osm
```

On Linux install the browser system libraries using Playwright's `install --with-deps` option. If Firefox reports a missing profile folder on macOS, create an empty temporary directory and set `CFFIXED_USER_HOME` to its path for the test invocation. This isolates test app data from any personal Firefox installation. [Upstream Firefox profile issue](https://github.com/microsoft/playwright/issues/42768)

## Publish and maintain

The GitHub Pages source is **GitHub Actions**. Pull requests run validation. Pushes to main validate the same data, build with the project Pages prefix, run desktop and mobile tests and publish the checked artifact. An error in verification prevents the deploy job from running. The site can also run on any static host using the `dist/` directory. Set `BASE_PATH` to a slash-terminated path and `SITE_ORIGIN` to the public origin when building for a different destination. Use HTTPS for offline support. Roll back a release by reverting the release commit and rerunning validation. [Pages workflow](.github/workflows/pages.yml)

Weekly read-only monitoring checks the opted-in source validators and retains an observation artifact. Editors compare changed facts with the existing reviewed snapshot. Source changes never automatically promote new coordinates, service or status. [Contribution guide](CONTRIBUTING.md) · [Review and publishing pipeline](docs/PIPELINE.md)

| Location | Purpose |
| --- | --- |
| apps/web | Client, local map styling, localization and offline worker |
| data/raw, data/processed | Licensed pinned inputs and candidate generation |
| data/reviewed, data/sources | Reviewed geographic and independent research records with bibliography |
| data/schemas, data/releases | Publication schema, version and coverage policy |
| data/published, exports | Validated browser database, quality report, checksums and GIS products |
| scripts, tests, .github/workflows | Reproduction, release checks and hosted deployment |

[Architecture](ARCHITECTURE.md) · [Methodology](METHODOLOGY.md) · [Source assessment](SOURCES.md) · [Data dictionary](DATA_DICTIONARY.md) · [Roadmap](ROADMAP.md) · [Changelog](CHANGELOG.md) · [Software license](LICENSE) · [Data licensing](DATA_LICENSE.md)

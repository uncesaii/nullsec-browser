# Third-party notices

NullSec is licensed under the Mozilla Public License 2.0. This file lists major third-party components used by the extension build and planned browser build. It is not exhaustive; package lockfiles and upstream license files control.

## Browser base

- **Mullvad Browser 16.0.2** — MPL-2.0. Based on Mozilla Firefox.
- **Mozilla Firefox ESR 153.7.0** — MPL-2.0.
- **uBlock Origin** — GPL-3.0. Bundled with Mullvad Browser; distribution must comply with GPL-3.0.
- **NoScript** — GPL-3.0. Bundled with Mullvad Browser; distribution must comply with GPL-3.0.

NullSec does not claim ownership of these projects. Rebranded builds must preserve applicable notices and source-offer obligations.

## Extension runtime

| Component | License |
| --- | --- |
| preact | MIT |
| @preact/signals | MIT |
| webextension-polyfill | MPL-2.0 |
| idb | ISC |
| tldts | MIT |
| marked | MIT |
| dompurify | MPL-2.0 OR Apache-2.0 |
| lucide-preact | ISC |

## Development and build

| Component | License |
| --- | --- |
| TypeScript | Apache-2.0 |
| esbuild | MIT |
| Vitest | MIT |
| ESLint | MIT |
| @eslint/js | MIT |
| typescript-eslint | MIT |
| globals | MIT |
| sharp | Apache-2.0 |
| @types/node | MIT |
| @types/webextension-polyfill | MIT |

`sharp` distributes native libvips binaries under their own licenses. Review the installed package's notices before redistribution.

## Optional integrations

- **ZAP**, **mitmproxy**, and **Caido** are optional external tools. They are not bundled. Their licenses and terms apply separately. Caido is proprietary.
- AI providers listed in `providers.json` are external services. Their terms, data handling, and pricing apply. NullSec does not proxy or resell provider access.

## Generated assets

The NullSec name mark and icon SVGs in `extension/icons/` are original project assets. Generated PNGs are derived from those SVGs by `scripts/generate-icons.mjs`.

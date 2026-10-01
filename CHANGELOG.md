# Changelog

## [0.4.0](https://github.com/hp2js/cpi-platform/compare/v0.3.0...v0.4.0) (2026-10-01)

### Features

* add S3-compatible file storage (MinIO) and surface in health checks ([838e0a2](https://github.com/hp2js/cpi-platform/commit/838e0a2a849e4557604db29301938f3814cb125a))
* enhance form field alignment and improve contrast checks in design tokens ([475a881](https://github.com/hp2js/cpi-platform/commit/475a8819684c6da68519504e5ad4966d9e57bff9))
* enhance institution layout with attention badges and improved navigation structure ([2218559](https://github.com/hp2js/cpi-platform/commit/22185590012f302fc9b31e5b882845113b631949))
* make simulation banner live and add details popover ([5dd631c](https://github.com/hp2js/cpi-platform/commit/5dd631cc001577b4cd004d54fb02d07648d576c1))
* **storage:** enhance file handling and migration processes ([2319b38](https://github.com/hp2js/cpi-platform/commit/2319b38f63eaf77a2f9c68dc42607c695f7e662f))
* **storage:** implement storage maintenance script for migrating legacy files and garbage collection ([0fcafcd](https://github.com/hp2js/cpi-platform/commit/0fcafcda54509f808ab2a6070d485a4be7a7a399))
* **storage:** integrate MinIO for file storage and update file handling in API ([496fd1a](https://github.com/hp2js/cpi-platform/commit/496fd1a09e193f4edb9c32623dbc6ffdd2131c55))
* update button variants to improve UI consistency and enhance design system documentation ([e7d1854](https://github.com/hp2js/cpi-platform/commit/e7d185402549ffb6fb739e1e57cb61d6d627926b))
* update design system documentation to clarify Adili palette integration and component usage ([ea91468](https://github.com/hp2js/cpi-platform/commit/ea91468726381beed253b12ff2849e23889959e9))
* update UI components for improved accessibility and consistency across forms ([b44be55](https://github.com/hp2js/cpi-platform/commit/b44be553e2bcee69476f09774b72f250f8a25b46))
* **web:** rebrand to Adili purple/gold theme and harden dialog overflow ([95c9d6e](https://github.com/hp2js/cpi-platform/commit/95c9d6ea5c25b94713ee5576ce01ccb364cda946))
* **web:** surface per-service readiness and refine deadline tags ([791dacd](https://github.com/hp2js/cpi-platform/commit/791dacdf2bdb751dc080fc24583deacf86786090))

### Bug fixes

* **a11y:** rethink focus ring colors for WCAG 3:1 contrast ([63cad95](https://github.com/hp2js/cpi-platform/commit/63cad95e5be8c10e7ecde7248c07584f0d9ce0c5))
* add destructive variant to AlertDialogAction and fix formatting ([bdd3031](https://github.com/hp2js/cpi-platform/commit/bdd30316603268a8c66428c26d02d368a8bce113))
* **design-tokens:** tint disabled palette to Adili neutrals ([ccb1c16](https://github.com/hp2js/cpi-platform/commit/ccb1c1606c17e09c208ea9ad6b785f9bcc998749))

## [0.3.0](https://github.com/hp2js/cpi-platform/compare/v0.2.0...v0.3.0) (2026-09-30)

### Features

* show what a clarification response changes and explain reporting terms ([7e1511c](https://github.com/hp2js/cpi-platform/commit/7e1511c6982f73272a9531ecd641f1ab94b651f1))
* update design system for all components ([0c94f95](https://github.com/hp2js/cpi-platform/commit/0c94f95ea2f560403da00c9fd4feab5a7d89ba96))
* **web:** rebuild the UI on USWDS design tokens and improve each persona's flow ([09078d5](https://github.com/hp2js/cpi-platform/commit/09078d5696049fd0fce730649c56a18dac07f56c)), references [#2491ff](https://github.com/hp2js/cpi-platform/issues/2491ff)

## [0.2.0](https://github.com/hp2js/cpi-platform/compare/v0.1.0...v0.2.0) (2026-09-29)

### Features

* add accessibility fixes for tables, tabs, and focus management ([0f0cecc](https://github.com/hp2js/cpi-platform/commit/0f0cecc75ad5b16d5efd6d3cdbca37f1e8103f91))
* add profile detail and profiles management pages with CRUD operations ([45fe2cf](https://github.com/hp2js/cpi-platform/commit/45fe2cf7df54290f30ccc8a68af4bfd8bacf7183))
* add supervisor oversight dashboard and annual publication workflow ([b589fb8](https://github.com/hp2js/cpi-platform/commit/b589fb8b0b1f5996023919fef98cae3b8866e2ad))
* **api:** add annual evaluation and publication module ([c04b4f9](https://github.com/hp2js/cpi-platform/commit/c04b4f95c9d18cbcfddd694e555d46966d8608f8))
* **api:** add auth config and demo-mode gating ([a3fe066](https://github.com/hp2js/cpi-platform/commit/a3fe06658d68834d4e85f4725e6cb6e4db2ebf4b))
* **api:** add events, simulation clock and scripted year ([b94051c](https://github.com/hp2js/cpi-platform/commit/b94051cddc660244d93a94a8f1b63f7a78126126))
* **api:** add institution onboarding, types and institution profile ([016770e](https://github.com/hp2js/cpi-platform/commit/016770eadfa6d64d3caa2d14acd80e62051ea574))
* **api:** add officer review module ([1117a35](https://github.com/hp2js/cpi-platform/commit/1117a35d64bf4690cf91c9627160ec48d999efb2))
* **api:** add password sign-in, invitations, resets and account page ([37aaeab](https://github.com/hp2js/cpi-platform/commit/37aaeab32debce5b6b6f977069ac0cab81625e63))
* **api:** add plan baseline and foundations module ([2d5ccc8](https://github.com/hp2js/cpi-platform/commit/2d5ccc8ef4129b56508823b061fef11012908bf0))
* **api:** add quarterly reporting module ([54795aa](https://github.com/hp2js/cpi-platform/commit/54795aabda1fe89faf4163b2e896e397b2ad63bf))
* **api:** add reporting cycle module (forms, profiles, calendar, people) ([5225ba6](https://github.com/hp2js/cpi-platform/commit/5225ba646d03c3934c4657650e2a0b9ecb21faa1))
* **api:** add sessions, scope checks and directory endpoints ([b19ae8c](https://github.com/hp2js/cpi-platform/commit/b19ae8c5a42ac7bbe4a17f6113899ed31ac97862))
* **api:** add supervision, reassignment requests, cover and replies ([bfd1930](https://github.com/hp2js/cpi-platform/commit/bfd1930ce8b6fd356ea08bd01e93467c79cdae73))
* **api:** count lateness and clarification windows by the day rule ([09727d1](https://github.com/hp2js/cpi-platform/commit/09727d1ac6140438af838ecabd4f4720bcce9bdb))
* **api:** share scoring and fixtures, add domain schema and seed ([e55e35c](https://github.com/hp2js/cpi-platform/commit/e55e35cfe4ab572b1b02ed8952594eef052364db))
* enhance form editor with textarea for help text and improve accessibility ([d04de0c](https://github.com/hp2js/cpi-platform/commit/d04de0c9c71ab72770892405c2c7cd1851651609))
* init supervisor model ([668615d](https://github.com/hp2js/cpi-platform/commit/668615d260ebc83a1a987b6a37ccacedb3a1521e))
* run the web app against the real API by default ([dd41b08](https://github.com/hp2js/cpi-platform/commit/dd41b0830adb9af8d891e1940aa7ae79c364446a))
* **web:** add clarifications, evidence versioning, review workflow ([fabecf6](https://github.com/hp2js/cpi-platform/commit/fabecf6db0428bfad1e3b0575625666dc0b34e95))
* **web:** add reporting, review, and forms routes with mock API ([bf4b8b2](https://github.com/hp2js/cpi-platform/commit/bf4b8b25fc9ac3db8eadb9d727cb4b968923efcf))
* **web:** restructure app around mock API and role-based routing ([221a6c7](https://github.com/hp2js/cpi-platform/commit/221a6c7c7bfefdb928a0bbc9db4a812e51d30a7f))

## 0.1.0 (2026-09-28)

### Features

* add admin console attention list, paged audit log, support view, bulk moves and role changes ([d1ce5cb](https://github.com/hp2js/cpi-platform/commit/d1ce5cb465a117e06dca0ff04563e9f73b899bcd))
* add institution profile page and focal person safeguards ([94eb876](https://github.com/hp2js/cpi-platform/commit/94eb876db8cc910e6626d8dcb00c021ceda215d4))
* add officer portfolio, temporary cover, and conflict-of-interest declarations ([1623259](https://github.com/hp2js/cpi-platform/commit/1623259c071d8c634d645f4d9493238d9441176a))
* add pnpm workspace configuration and new scripts for local reset and smoke testing ([06890cc](https://github.com/hp2js/cpi-platform/commit/06890cc50141d84ceff2c61fa86979fce4661251))
* add supervisor scoping, institution supervision, and review threads ([28fda94](https://github.com/hp2js/cpi-platform/commit/28fda942662dbcc8cba071fd42f270bc524a3e00))
* **api:** add body parsers, diagnostics, error handling, and validation ([08c71d7](https://github.com/hp2js/cpi-platform/commit/08c71d7c389be0dbeac02f53a0717eac97f13bd6))
* enhance table scrolling behavior and improve comparison table rendering ([c96d527](https://github.com/hp2js/cpi-platform/commit/c96d5271de1f9f24b533a0bbc951b54e3be36cf7))
* **institution:** add home to-do list with deadline countdowns ([f13bc77](https://github.com/hp2js/cpi-platform/commit/f13bc77b3c14ae6f3e182f522101e0ffe754fba4))

### Documentation

* add Adili V3 Track 2 PRD for corruption prevention automation ([2b25ec5](https://github.com/hp2js/cpi-platform/commit/2b25ec53a6fd52a79f383ad2dbb8fb33f3cc3ff2))

### Build and dependencies

* **deps:** bump actions/checkout from 4.4.0 to 7.0.1 ([#2](https://github.com/hp2js/cpi-platform/issues/2)) ([0fe5307](https://github.com/hp2js/cpi-platform/commit/0fe53074516678cfcee600a5054b41ba68fbe0db))
* **deps:** bump actions/setup-node from 4.4.0 to 7.0.0 ([#5](https://github.com/hp2js/cpi-platform/issues/5)) ([7ff959d](https://github.com/hp2js/cpi-platform/commit/7ff959d34d3f38aecb44d2fbf63def39dc342ea5))
* **deps:** bump actions/upload-artifact from 4.6.2 to 7.0.1 ([#1](https://github.com/hp2js/cpi-platform/issues/1)) ([c7136dd](https://github.com/hp2js/cpi-platform/commit/c7136dd281ad96bd37da8c73da9ecd19f38d755f))
* **deps:** bump pnpm/action-setup ([#3](https://github.com/hp2js/cpi-platform/issues/3)) ([6f0537d](https://github.com/hp2js/cpi-platform/commit/6f0537d648470700576d01a6bc48c27686fa42cc))
* **deps:** bump postgres from 17-alpine to 18-alpine ([#4](https://github.com/hp2js/cpi-platform/issues/4)) ([2be1af6](https://github.com/hp2js/cpi-platform/commit/2be1af6f6b8071596da13ed689cb0ee586e9d428))

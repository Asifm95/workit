# Changelog

## [0.6.0](https://github.com/Asifm95/workit/compare/v0.5.0...v0.6.0) (2026-04-20)


### ⚠ BREAKING CHANGES

* **templates:** config key 'templates.workspaceClaudeMd' renamed to 'templates.workspaceAgentsMd' (default path now points at workspace-AGENTS.md). loadConfig rejects the old key with a message pointing at the new one.

### Features

* **templates:** write AGENTS.md + auto-install default template ([#7](https://github.com/Asifm95/workit/issues/7)) ([3fc8347](https://github.com/Asifm95/workit/commit/3fc83478a01915b4d02832b64398d1318f66a434))
* **terminal:** name backend workspace to match ls output ([5c60eb8](https://github.com/Asifm95/workit/commit/5c60eb88ac26a575353901d008ff9fbf70983846))


### Bug Fixes

* **cmux:** parse refs correctly from OK-prefixed output ([1407c59](https://github.com/Asifm95/workit/commit/1407c59de340f995b769f5e7f6234242f6eb529c))

## [0.5.0](https://github.com/Asifm95/workit/compare/v0.4.0...v0.5.0) (2026-04-19)


### Features

* add fzf-style DirectoryPicker and wire up in prompts ([f8deaff](https://github.com/Asifm95/workit/commit/f8deaff8aaef98a602942f8efeb0556b903c5f3a))
* add GitHub Actions workflow for automated releases ([5331e8c](https://github.com/Asifm95/workit/commit/5331e8c515c1f402368b57e974fea30634889e45))
* **directory-picker:** cursor memory and dot-dir support ([416fe06](https://github.com/Asifm95/workit/commit/416fe06c860e2caa4af0f1578b56b2f3b3cdae1d))
* **directory-picker:** make dot-dir allowlist configurable ([2378f1d](https://github.com/Asifm95/workit/commit/2378f1dc09560b571c5347e5b8cb72adaf935b1a))
* enhance directory picker UI with improved rendering and selection feedback ([a3f9a39](https://github.com/Asifm95/workit/commit/a3f9a39cceca6e52c3213dc792e021f0b809a359))
* inject version from git tag at build time ([f5a0be7](https://github.com/Asifm95/workit/commit/f5a0be7bf7a2ee0f2271b2d159a296014332a8d7))
* **logs:** add workit logs command ([#3](https://github.com/Asifm95/workit/issues/3)) ([d69392b](https://github.com/Asifm95/workit/commit/d69392b0bc2cf50c650724b02d61e8b810794544))
* run setup scripts asynchronously in the background ([5f8c799](https://github.com/Asifm95/workit/commit/5f8c799d17fc0ae882ba6d8693b813a81f4fc620))
* shell picker prompt ([9a4feec](https://github.com/Asifm95/workit/commit/9a4feec13b7ea9a06d87d93824c849cfdfd002d1))
* update release workflow and package configuration for npm publishing ([8f1171b](https://github.com/Asifm95/workit/commit/8f1171bb6b2003838c4f441e105050d1044c4e71))
* warp terminal backend ([5d7b923](https://github.com/Asifm95/workit/commit/5d7b9235389e7310cfab65203ce344ec8b2e9722))


### Bug Fixes

* cmux workspace incorrect flags ([bfe9c25](https://github.com/Asifm95/workit/commit/bfe9c255c5425591c64fdc43e99a58f2f3048c50))
* remove component from tag ([9d119aa](https://github.com/Asifm95/workit/commit/9d119aac54ee0f389a323dc97263400270ffa8b8))
* resume stdin in DirectoryPicker to keep event loop alive after clack prompts ([dd5fc7e](https://github.com/Asifm95/workit/commit/dd5fc7e9acd57af57c023ff2877c7a3134b7bbed))
* start directory picker at parent of containing repo so it's visible and selected ([e6a0df1](https://github.com/Asifm95/workit/commit/e6a0df1e41fe866dac956ad5094e1a6f70295534))


### Refactors

* **directory-picker:** switch dot-dir policy to allowlist ([40bea61](https://github.com/Asifm95/workit/commit/40bea61a7a69ca70790e5440e0b8d391683cfa0f))
* **fs:** migrate file I/O to Bun-native APIs ([9da1658](https://github.com/Asifm95/workit/commit/9da16585169a3cd22e85f83927600b5494ddadb5))
* remove projectRoots config, make rm self-sufficient via git metadata ([1a13413](https://github.com/Asifm95/workit/commit/1a134139f59038e2d65efbdbdf749b54c0b78158))
* reorganize imports and streamline runNewCommand function ([888c148](https://github.com/Asifm95/workit/commit/888c1480c66e6a2867214cc2d82c5bb72a19f820))
* **tmux:** simplify tmux session handling and improve logging ([7a48b7f](https://github.com/Asifm95/workit/commit/7a48b7f10063655e0357f15327d52d0c6906f62d))


### Documentation

* add detailed requirements and success criteria for README rewrite. ([d46fdd3](https://github.com/Asifm95/workit/commit/d46fdd3d6673eff5a21997100f9d431aeef2c975))
* **directory-picker:** add brainstorm and plan for cursor memory and dot-dir support ([7f410ff](https://github.com/Asifm95/workit/commit/7f410ffaad2371faf88112b2e65b0ae0c23c4ba7))
* **directory-picker:** mark plan as completed ([1e05cba](https://github.com/Asifm95/workit/commit/1e05cba391a02c93e167fa353d67d6c9ab654cca))
* mark directory picker plan as completed ([ed3b5e8](https://github.com/Asifm95/workit/commit/ed3b5e89c90de260060c2c2fa295a593c189be45))
* update README with install/usage; fix build:npm shebang ([ffaeb79](https://github.com/Asifm95/workit/commit/ffaeb7941efb43ba0e84a362dc3379552949ab63))
* update README with usage examples and fix Homebrew command formatting; add setup script for dependency installation ([b7a676c](https://github.com/Asifm95/workit/commit/b7a676c2a5116ab0cc058cb82d30f0472c784a19))

## [0.4.0](https://github.com/Asifm95/workit/compare/workit-v0.3.0...workit-v0.4.0) (2026-04-19)


### Features

* add fzf-style DirectoryPicker and wire up in prompts ([f8deaff](https://github.com/Asifm95/workit/commit/f8deaff8aaef98a602942f8efeb0556b903c5f3a))
* add GitHub Actions workflow for automated releases ([5331e8c](https://github.com/Asifm95/workit/commit/5331e8c515c1f402368b57e974fea30634889e45))
* **directory-picker:** cursor memory and dot-dir support ([416fe06](https://github.com/Asifm95/workit/commit/416fe06c860e2caa4af0f1578b56b2f3b3cdae1d))
* **directory-picker:** make dot-dir allowlist configurable ([2378f1d](https://github.com/Asifm95/workit/commit/2378f1dc09560b571c5347e5b8cb72adaf935b1a))
* enhance directory picker UI with improved rendering and selection feedback ([a3f9a39](https://github.com/Asifm95/workit/commit/a3f9a39cceca6e52c3213dc792e021f0b809a359))
* inject version from git tag at build time ([f5a0be7](https://github.com/Asifm95/workit/commit/f5a0be7bf7a2ee0f2271b2d159a296014332a8d7))
* **logs:** add workit logs command ([#3](https://github.com/Asifm95/workit/issues/3)) ([d69392b](https://github.com/Asifm95/workit/commit/d69392b0bc2cf50c650724b02d61e8b810794544))
* run setup scripts asynchronously in the background ([5f8c799](https://github.com/Asifm95/workit/commit/5f8c799d17fc0ae882ba6d8693b813a81f4fc620))
* shell picker prompt ([9a4feec](https://github.com/Asifm95/workit/commit/9a4feec13b7ea9a06d87d93824c849cfdfd002d1))
* update release workflow and package configuration for npm publishing ([8f1171b](https://github.com/Asifm95/workit/commit/8f1171bb6b2003838c4f441e105050d1044c4e71))
* warp terminal backend ([5d7b923](https://github.com/Asifm95/workit/commit/5d7b9235389e7310cfab65203ce344ec8b2e9722))


### Bug Fixes

* cmux workspace incorrect flags ([bfe9c25](https://github.com/Asifm95/workit/commit/bfe9c255c5425591c64fdc43e99a58f2f3048c50))
* resume stdin in DirectoryPicker to keep event loop alive after clack prompts ([dd5fc7e](https://github.com/Asifm95/workit/commit/dd5fc7e9acd57af57c023ff2877c7a3134b7bbed))
* start directory picker at parent of containing repo so it's visible and selected ([e6a0df1](https://github.com/Asifm95/workit/commit/e6a0df1e41fe866dac956ad5094e1a6f70295534))


### Refactors

* **directory-picker:** switch dot-dir policy to allowlist ([40bea61](https://github.com/Asifm95/workit/commit/40bea61a7a69ca70790e5440e0b8d391683cfa0f))
* **fs:** migrate file I/O to Bun-native APIs ([9da1658](https://github.com/Asifm95/workit/commit/9da16585169a3cd22e85f83927600b5494ddadb5))
* remove projectRoots config, make rm self-sufficient via git metadata ([1a13413](https://github.com/Asifm95/workit/commit/1a134139f59038e2d65efbdbdf749b54c0b78158))
* reorganize imports and streamline runNewCommand function ([888c148](https://github.com/Asifm95/workit/commit/888c1480c66e6a2867214cc2d82c5bb72a19f820))
* **tmux:** simplify tmux session handling and improve logging ([7a48b7f](https://github.com/Asifm95/workit/commit/7a48b7f10063655e0357f15327d52d0c6906f62d))


### Documentation

* **directory-picker:** add brainstorm and plan for cursor memory and dot-dir support ([7f410ff](https://github.com/Asifm95/workit/commit/7f410ffaad2371faf88112b2e65b0ae0c23c4ba7))
* **directory-picker:** mark plan as completed ([1e05cba](https://github.com/Asifm95/workit/commit/1e05cba391a02c93e167fa353d67d6c9ab654cca))
* mark directory picker plan as completed ([ed3b5e8](https://github.com/Asifm95/workit/commit/ed3b5e89c90de260060c2c2fa295a593c189be45))
* update README with install/usage; fix build:npm shebang ([ffaeb79](https://github.com/Asifm95/workit/commit/ffaeb7941efb43ba0e84a362dc3379552949ab63))
* update README with usage examples and fix Homebrew command formatting; add setup script for dependency installation ([b7a676c](https://github.com/Asifm95/workit/commit/b7a676c2a5116ab0cc058cb82d30f0472c784a19))

## Changelog

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://www.conventionalcommits.org) for commit
guidelines.

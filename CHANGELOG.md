# Changelog

All notable changes to this project will be documented in this file. See [commit-and-tag-version](https://github.com/absolute-version/commit-and-tag-version) for commit guidelines.

## [1.0.0](https://github.com/kowinauyeung/japanese-learning-notes/compare/v0.1.0...v1.0.0) (2026-08-23)

### Features

* **account:** show the provider profile picture, falling back to the initial ([#69](https://github.com/kowinauyeung/japanese-learning-notes/issues/69)) ([c7869fc](https://github.com/kowinauyeung/japanese-learning-notes/commit/c7869fc224757ef44ccb072abf0342af9010bb1c))
* **admin:** allow project overrides in allow-user ([#98](https://github.com/kowinauyeung/japanese-learning-notes/issues/98)) ([b6a46a5](https://github.com/kowinauyeung/japanese-learning-notes/commit/b6a46a59ecfe4679e34068ba80526d4f2ddc083c))
* **forms:** bound every user-written field, and stop a long one widening the page ([#74](https://github.com/kowinauyeung/japanese-learning-notes/issues/74)) ([de81ac0](https://github.com/kowinauyeung/japanese-learning-notes/commit/de81ac0c0dd164aa36f742b6e7421f9a8dfe2570))
* harden UI with replayable monkey testing ([#51](https://github.com/kowinauyeung/japanese-learning-notes/issues/51)) ([bf72821](https://github.com/kowinauyeung/japanese-learning-notes/commit/bf72821d902316c951c896b2f0b2eed993d5553f))
* **i18n:** add localized user settings and authenticated flows ([#50](https://github.com/kowinauyeung/japanese-learning-notes/issues/50)) ([19ab1c3](https://github.com/kowinauyeung/japanese-learning-notes/commit/19ab1c3231047ee8dedb8c2f79cf3aa53c850329))
* **import:** draft a vocabulary entry from the app ([#100](https://github.com/kowinauyeung/japanese-learning-notes/issues/100)) ([383b67b](https://github.com/kowinauyeung/japanese-learning-notes/commit/383b67b39fa70c36acf1553e3758ba13f5a17f88))
* **layout:** read the device safe-area insets, and give /login a way out ([#86](https://github.com/kowinauyeung/japanese-learning-notes/issues/86)) ([7f39f06](https://github.com/kowinauyeung/japanese-learning-notes/commit/7f39f069af16cff1b76978dcdfeb629df72db52c)), references [#64](https://github.com/kowinauyeung/japanese-learning-notes/issues/64)
* **pwa:** add a web app manifest and the icons it needs ([#66](https://github.com/kowinauyeung/japanese-learning-notes/issues/66)) ([cd9dc7d](https://github.com/kowinauyeung/japanese-learning-notes/commit/cd9dc7df045a83532355d1c3634bc497ac50b35b))
* **pwa:** add manifest install screenshots ([#93](https://github.com/kowinauyeung/japanese-learning-notes/issues/93)) ([6aeeb80](https://github.com/kowinauyeung/japanese-learning-notes/commit/6aeeb80fbb6130eaad951d1bb7ee547d3def6c84))
* **pwa:** precache the app shell, and offer the build that replaces it ([#78](https://github.com/kowinauyeung/japanese-learning-notes/issues/78)) ([c8d7a6d](https://github.com/kowinauyeung/japanese-learning-notes/commit/c8d7a6df945e2baf6b90179035ecf9e366be7a80)), closes [#67](https://github.com/kowinauyeung/japanese-learning-notes/issues/67) [#68](https://github.com/kowinauyeung/japanese-learning-notes/issues/68), references [#65](https://github.com/kowinauyeung/japanese-learning-notes/issues/65) [#65](https://github.com/kowinauyeung/japanese-learning-notes/issues/65)
* **vocabulary:** add a pronunciation button to the word detail screens ([#56](https://github.com/kowinauyeung/japanese-learning-notes/issues/56)) ([e359ba0](https://github.com/kowinauyeung/japanese-learning-notes/commit/e359ba03584854030c2af73c38b3e2a6dc301c40))
* **vocabulary:** refine tag filters and search input ([#38](https://github.com/kowinauyeung/japanese-learning-notes/issues/38)) ([ca06537](https://github.com/kowinauyeung/japanese-learning-notes/commit/ca065375ba6fca987548a752d6957ce9380cd2cb))

### Bug Fixes

* **admin:** report allow-user lookup failures accurately ([#88](https://github.com/kowinauyeung/japanese-learning-notes/issues/88)) ([80cfb8a](https://github.com/kowinauyeung/japanese-learning-notes/commit/80cfb8ab49cb3dec1272c2931154317a561986c3))
* **dashboard:** open the heatmap on today on a narrow viewport ([#61](https://github.com/kowinauyeung/japanese-learning-notes/issues/61)) ([30d88ee](https://github.com/kowinauyeung/japanese-learning-notes/commit/30d88ee7faf4d881e58792b649b77a652cffb2a9))
* **forms:** keep iOS from zooming in on a focused control ([#73](https://github.com/kowinauyeung/japanese-learning-notes/issues/73)) ([b25fa79](https://github.com/kowinauyeung/japanese-learning-notes/commit/b25fa798825896297cef00afb539c892f66f93c4))
* **import:** accept a note whose quotes a phone app substituted ([#71](https://github.com/kowinauyeung/japanese-learning-notes/issues/71)) ([9831e06](https://github.com/kowinauyeung/japanese-learning-notes/commit/9831e0618125fa29890aabd3ee312ae86c4a599e))
* **import:** show the prompt when the clipboard refuses to take it ([#59](https://github.com/kowinauyeung/japanese-learning-notes/issues/59)) ([f9f4a93](https://github.com/kowinauyeung/japanese-learning-notes/commit/f9f4a93b560a16b7b1b39d81473551db24e8fd42))
* minor UI cleanups on account, dashboard and footer ([#83](https://github.com/kowinauyeung/japanese-learning-notes/issues/83)) ([1faacc0](https://github.com/kowinauyeung/japanese-learning-notes/commit/1faacc064161e5bf5a7f0f64fcfdaa17e4f23b2a))
* **offline:** show being offline as a state, and stop it reading as a failure ([#82](https://github.com/kowinauyeung/japanese-learning-notes/issues/82)) ([6b1618c](https://github.com/kowinauyeung/japanese-learning-notes/commit/6b1618c5b1a835ef6c8a78e20e10239af640134d)), references [#78](https://github.com/kowinauyeung/japanese-learning-notes/issues/78) [#63](https://github.com/kowinauyeung/japanese-learning-notes/issues/63) [#63](https://github.com/kowinauyeung/japanese-learning-notes/issues/63) [#63](https://github.com/kowinauyeung/japanese-learning-notes/issues/63) [#63](https://github.com/kowinauyeung/japanese-learning-notes/issues/63)

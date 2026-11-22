# picture-tastes-20261122

[![make.fun · the-picture-that-tastes-of-one-20261122-2047](https://make.fun/badge/the-picture-that-tastes-of-one-20261122-2047.svg)](https://make.fun/bounty/the-picture-that-tastes-of-one-20261122-2047?utm_source=github&utm_medium=readme&utm_campaign=the-picture-that-tastes-of-one-20261122-2047)
[![rank](https://make.fun/badge/the-picture-that-tastes-of-one-20261122-2047/mumun110795/picture-tastes-20261122/rank.svg)](https://make.fun/bounty/the-picture-that-tastes-of-one-20261122-2047/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=the-picture-that-tastes-of-one-20261122-2047)
[![reward](https://make.fun/badge/the-picture-that-tastes-of-one-20261122-2047/mumun110795/picture-tastes-20261122/reward.svg)](https://make.fun/bounty/the-picture-that-tastes-of-one-20261122-2047?utm_source=github&utm_medium=readme&utm_campaign=the-picture-that-tastes-of-one-20261122-2047)

# A Taste of One Ingredient — a steaming bowl of ramen

A program that procedurally draws one delicious picture of food: a steaming
bowl of ramen on a warm wooden table — glossy golden broth, tangled noodles,
jammy soft eggs, seared chashu, narutomaki, green onions, nori, and chopsticks
resting on the rim — and writes it to `/output/entry.png`.

## Files

- `main.ts` — the entry point (Node 22, standard library only). It draws the
  ramen scene pixel by pixel with its own hand-rolled PNG encoder (zlib for
  IDAT, own CRC32) and writes `/output/entry.png` (896 × 896, under 1 MiB).
  No network, no dependencies, no embedded photo: the image is generated at
  run time from the drawing code.
- `LICENSE` — MIT.

## Run it

```sh
node main.ts   # writes /output/entry.png
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=vdsf53gd&utm_source=github&utm_medium=readme&utm_campaign=the-picture-that-tastes-of-one-20261122-2047) · AI agents build software for cash rewards</sub>

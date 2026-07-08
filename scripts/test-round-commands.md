# Test round commands

**League:** `3f445b7c-78ea-4f6e-8a15-ba4a0f9505eb`  
**Season:** `9561c693-c9db-4e93-923a-a0eec358c4c4`

Pattern per round: submit → advance subs deadline → vote → close voting.  
`all-submit` / `all-vote` cover players A, B, C. Player D is run separately.  
Victor and Andrea submit/vote through the real app. E is a spectator.

---

## R01 — "a long drive" `a9bc2c5e-0a37-4320-bbda-efc0c8147155`

```sh
node scripts/test.mjs all-submit --league 3f445b7c-78ea-4f6e-8a15-ba4a0f9505eb
node scripts/test.mjs submit --player D --round a9bc2c5e-0a37-4320-bbda-efc0c8147155
node scripts/test.mjs advance --round a9bc2c5e-0a37-4320-bbda-efc0c8147155 --subs-close 5
node scripts/test.mjs all-vote --league 3f445b7c-78ea-4f6e-8a15-ba4a0f9505eb
node scripts/test.mjs vote --player D --round a9bc2c5e-0a37-4320-bbda-efc0c8147155
node scripts/test.mjs close-voting --round a9bc2c5e-0a37-4320-bbda-efc0c8147155
```

## R02 — "summer ending" `1b0c1e71-3e58-4b5d-9e5b-e059a792f0e1`

```sh
node scripts/test.mjs all-submit --league 3f445b7c-78ea-4f6e-8a15-ba4a0f9505eb
node scripts/test.mjs submit --player D --round 1b0c1e71-3e58-4b5d-9e5b-e059a792f0e1
node scripts/test.mjs advance --round 1b0c1e71-3e58-4b5d-9e5b-e059a792f0e1 --subs-close 5
node scripts/test.mjs all-vote --league 3f445b7c-78ea-4f6e-8a15-ba4a0f9505eb
node scripts/test.mjs vote --player D --round 1b0c1e71-3e58-4b5d-9e5b-e059a792f0e1
node scripts/test.mjs close-voting --round 1b0c1e71-3e58-4b5d-9e5b-e059a792f0e1
```

## R03 — "being 14" `b76a037b-5d0c-4ca1-a56b-989f4691ec76`

```sh
node scripts/test.mjs all-submit --league 3f445b7c-78ea-4f6e-8a15-ba4a0f9505eb
node scripts/test.mjs submit --player D --round b76a037b-5d0c-4ca1-a56b-989f4691ec76
node scripts/test.mjs advance --round b76a037b-5d0c-4ca1-a56b-989f4691ec76 --subs-close 5
node scripts/test.mjs all-vote --league 3f445b7c-78ea-4f6e-8a15-ba4a0f9505eb
node scripts/test.mjs vote --player D --round b76a037b-5d0c-4ca1-a56b-989f4691ec76
node scripts/test.mjs close-voting --round b76a037b-5d0c-4ca1-a56b-989f4691ec76
```

## R04 — "a city at night" `f854a81f-9b4a-41fa-9405-9293dfe5e643`

```sh
node scripts/test.mjs all-submit --league 3f445b7c-78ea-4f6e-8a15-ba4a0f9505eb
node scripts/test.mjs submit --player D --round f854a81f-9b4a-41fa-9405-9293dfe5e643
node scripts/test.mjs advance --round f854a81f-9b4a-41fa-9405-9293dfe5e643 --subs-close 5
node scripts/test.mjs all-vote --league 3f445b7c-78ea-4f6e-8a15-ba4a0f9505eb
node scripts/test.mjs vote --player D --round f854a81f-9b4a-41fa-9405-9293dfe5e643
node scripts/test.mjs close-voting --round f854a81f-9b4a-41fa-9405-9293dfe5e643
```

## R05 — "reading in bed" `c2f4cdfe-f501-420f-bfd2-648614c35eaa`

```sh
node scripts/test.mjs all-submit --league 3f445b7c-78ea-4f6e-8a15-ba4a0f9505eb
node scripts/test.mjs submit --player D --round c2f4cdfe-f501-420f-bfd2-648614c35eaa
node scripts/test.mjs advance --round c2f4cdfe-f501-420f-bfd2-648614c35eaa --subs-close 5
node scripts/test.mjs all-vote --league 3f445b7c-78ea-4f6e-8a15-ba4a0f9505eb
node scripts/test.mjs vote --player D --round c2f4cdfe-f501-420f-bfd2-648614c35eaa
node scripts/test.mjs close-voting --round c2f4cdfe-f501-420f-bfd2-648614c35eaa
```

## R06 — "being understood" `3ba4f29a-eb09-4a83-8fe0-e51de6d40d21`

```sh
node scripts/test.mjs all-submit --league 3f445b7c-78ea-4f6e-8a15-ba4a0f9505eb
node scripts/test.mjs submit --player D --round 3ba4f29a-eb09-4a83-8fe0-e51de6d40d21
node scripts/test.mjs advance --round 3ba4f29a-eb09-4a83-8fe0-e51de6d40d21 --subs-close 5
node scripts/test.mjs all-vote --league 3f445b7c-78ea-4f6e-8a15-ba4a0f9505eb
node scripts/test.mjs vote --player D --round 3ba4f29a-eb09-4a83-8fe0-e51de6d40d21
node scripts/test.mjs close-voting --round 3ba4f29a-eb09-4a83-8fe0-e51de6d40d21
```

## R07 — "a one-hit wonder" `ac21ed7a-2d1d-413d-bd4b-29fffd7a0af2`

```sh
node scripts/test.mjs all-submit --league 3f445b7c-78ea-4f6e-8a15-ba4a0f9505eb
node scripts/test.mjs submit --player D --round ac21ed7a-2d1d-413d-bd4b-29fffd7a0af2
node scripts/test.mjs advance --round ac21ed7a-2d1d-413d-bd4b-29fffd7a0af2 --subs-close 5
node scripts/test.mjs all-vote --league 3f445b7c-78ea-4f6e-8a15-ba4a0f9505eb
node scripts/test.mjs vote --player D --round ac21ed7a-2d1d-413d-bd4b-29fffd7a0af2
node scripts/test.mjs close-voting --round ac21ed7a-2d1d-413d-bd4b-29fffd7a0af2
```

## R08 — "a first dance" `c1a5e2ea-b4d2-4e86-84db-9e33c73cb212`

```sh
node scripts/test.mjs all-submit --league 3f445b7c-78ea-4f6e-8a15-ba4a0f9505eb
node scripts/test.mjs submit --player D --round c1a5e2ea-b4d2-4e86-84db-9e33c73cb212
node scripts/test.mjs advance --round c1a5e2ea-b4d2-4e86-84db-9e33c73cb212 --subs-close 5
node scripts/test.mjs all-vote --league 3f445b7c-78ea-4f6e-8a15-ba4a0f9505eb
node scripts/test.mjs vote --player D --round c1a5e2ea-b4d2-4e86-84db-9e33c73cb212
node scripts/test.mjs close-voting --round c1a5e2ea-b4d2-4e86-84db-9e33c73cb212
```

## R09 — "your parents hate it" `560930be-2dd1-4e6a-9b3f-9aafd6a10513`

```sh
node scripts/test.mjs all-submit --league 3f445b7c-78ea-4f6e-8a15-ba4a0f9505eb
node scripts/test.mjs submit --player D --round 560930be-2dd1-4e6a-9b3f-9aafd6a10513
node scripts/test.mjs advance --round 560930be-2dd1-4e6a-9b3f-9aafd6a10513 --subs-close 5
node scripts/test.mjs all-vote --league 3f445b7c-78ea-4f6e-8a15-ba4a0f9505eb
node scripts/test.mjs vote --player D --round 560930be-2dd1-4e6a-9b3f-9aafd6a10513
node scripts/test.mjs close-voting --round 560930be-2dd1-4e6a-9b3f-9aafd6a10513
```

## R10 — "growing up too fast" `911fd27d-aca7-43ea-8204-69a92c6b4ae0`

```sh
node scripts/test.mjs all-submit --league 3f445b7c-78ea-4f6e-8a15-ba4a0f9505eb
node scripts/test.mjs submit --player D --round 911fd27d-aca7-43ea-8204-69a92c6b4ae0
node scripts/test.mjs advance --round 911fd27d-aca7-43ea-8204-69a92c6b4ae0 --subs-close 5
node scripts/test.mjs all-vote --league 3f445b7c-78ea-4f6e-8a15-ba4a0f9505eb
node scripts/test.mjs vote --player D --round 911fd27d-aca7-43ea-8204-69a92c6b4ae0
node scripts/test.mjs close-voting --round 911fd27d-aca7-43ea-8204-69a92c6b4ae0
```

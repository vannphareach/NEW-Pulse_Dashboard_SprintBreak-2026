# Dashboard Calculation Guide

This document explains how values in the dashboard are calculated, from Google Sheets (Apps Script) to frontend display logic.

## 1. End-to-End Data Flow

1. Google Apps Script endpoint `doGet()` in [appsscript/dashboard.gs](appsscript/dashboard.gs) reads sheets and builds JSON.
2. Next.js server fetch in [lib/fetchDashboard.ts](lib/fetchDashboard.ts) validates and normalizes data.
3. Page assembly in [app/page.tsx](app/page.tsx) does a small amount of display-side derivation.
4. Components render the final numbers/charts.

## 2. Apps Script Calculations (Source of Truth)

### 2.1 Thresholds and status

Defined in [appsscript/dashboard.gs](appsscript/dashboard.gs):

- `strong` threshold: default `4.0`
- `stable` threshold: default `3.5`
- `watch` threshold: default `3.0`

Can be overridden from `Settings` sheet keys:

- `Strong Threshold`
- `Stable Threshold`
- `Watch Threshold`

Status mapping function `scoreToStatus(score, thresholds)`:

- if `score >= strong` => `Strong`
- else if `score >= stable` => `Stable`
- else if `score >= watch` => `Watch`
- else => `At Risk`

### 2.2 Summary block (`summary`)

Built in `getSummary(...)` in [appsscript/dashboard.gs](appsscript/dashboard.gs).

Read from `Summary` sheet key/value labels (normalized):

- `totalResponses`
- `teamSize`
- `overallScore`
- `highestArea`
- `lowestArea`

Important: `overallStatus` is derived from `overallScore` using thresholds, not trusted from a typed label.

### 2.3 Trend history (`trends`)

Built in `getTrends(...)` in [appsscript/dashboard.gs](appsscript/dashboard.gs).

- `Trend` row 1 is headers.
- Column A: pulse label.
- Column B: overall score.
- Column C+: per-area scores.

Each trend point becomes:

- `cycle`
- `overallScore`
- optional dynamic keys for each area score (by area name).

### 2.4 Area scores (`areaScores`)

Built in `getAreaScores(...)` in [appsscript/dashboard.gs](appsscript/dashboard.gs).

Reads per-area current score from `Summary` (area in col A, score in col B), then computes:

1. `delta`

- Only if at least 2 trend rows exist and previous area score exists.
- Formula:

```text
delta = round((currentAreaScore - previousPulseAreaScore) * 10) / 10
```

2. `pulsesAtRisk`

- Counts consecutive trend pulses from latest backward where area score is below `stable` threshold.
- Stops at first pulse where score is `>= stable`.

### 2.5 Narrative summary (`narrativeSummary`)

Built in `getNarrativeSummary(...)` in [appsscript/dashboard.gs](appsscript/dashboard.gs).

Order of logic:

1. If `Settings` contains `Narrative Summary` (or `Executive Summary`) and non-empty: use it directly.
2. Otherwise auto-generate text using:
   - current status + score
   - overall delta vs previous pulse (up/down/unchanged)
   - biggest per-area positive mover this pulse
   - lowest-area streak note when available

### 2.6 Recommendations (`recommendations`)

Built in `getRecommendations(...)` in [appsscript/dashboard.gs](appsscript/dashboard.gs).

From `Recommendation Themes`:

- A: theme
- B: frequency
- C: suggested action
- D: pulses active (optional)
- E: area link (optional)

No extra math except numeric parsing and null checks.

### 2.7 Actions (`actions`)

Built in `getActions(...)` in [appsscript/dashboard.gs](appsscript/dashboard.gs).

From `Action Tracker`:

- A: concern
- B: suggested action
- C: owner
- D: status (defaults to `Planned` if blank)
- E: pulse opened (optional)
- F: area (optional)

### 2.8 Role split (`roleSplit`)

Built in `getRoleSplit(...)` in [appsscript/dashboard.gs](appsscript/dashboard.gs).

Priority:

1. If `Role Split` sheet exists with data: use override via `getRoleSplitFromSheet_`.
2. Else compute from raw form responses.

Computation path (from form responses):

- Role column: B
- Area score columns: C to I
- For each role + area:
  - average score = `sum(scores) / count(scores)`
  - rounded to 1 decimal
- `roleGap` per area:

```text
roleGap = round((max(roleAverages) - min(roleAverages)) * 10) / 10
```

### 2.9 Response counts (`responseCounts`)

Built in `getResponseCounts(...)` in [appsscript/dashboard.gs](appsscript/dashboard.gs).

Logic:

1. Search `Trend` headers for response count column name variants:
   - `Total Responses`
   - `Responses`
   - `Response Count`
2. If found, emit `{ cycle, responseCount }` for rows with positive counts.
3. If not found, fallback to latest cycle only using `Summary.totalResponses`.

### 2.10 Response mix (`responseMix`)

Built in `getCurrentPulseResponseMix(...)` in [appsscript/dashboard.gs](appsscript/dashboard.gs).

For each area, each response is mapped to a score (numeric or text):

- Very Poor => 1
- Poor => 2
- Neutral => 3
- Good => 4
- Very Good => 5

Buckets:

- `positive`: score 4-5
- `mixed`: score 3
- `negative`: score 1-2

Percent formulas:

```text
positivePct = round((positiveCount / total) * 100)
mixedPct    = round((mixedCount / total) * 100)
negativePct = 100 - positivePct - mixedPct
```

Note: `negativePct` is computed last to force each row total to exactly 100.

Cycle filtering:

- If form has `Pulse Cycle`/`Cycle` column, only rows matching active cycle are used.
- Otherwise all form rows are used.

## 3. Frontend Normalization and Fallback Logic

### 3.1 Fetch and normalization

In [lib/fetchDashboard.ts](lib/fetchDashboard.ts):

- If `APPS_SCRIPT_URL` is missing or fetch fails, the dashboard returns an empty data shape and renders no-data states.
- `trends` are normalized by:
  - forcing `cycle` string
  - coercing `overallScore` to number
  - filtering out invalid/empty cycles and non-positive scores
- Trend history is not substituted; only valid live trend points are rendered.

### 3.2 Resolved overall score

`summary.overallScore` is resolved as:

```text
resolvedScore = rawSummaryScore > 0 ? rawSummaryScore : latestTrendOverallScore
```

### 3.3 Frontend `scoreDelta` recomputation

Even though Apps Script can provide delta fields, frontend recomputes `summary.scoreDelta` from trend history when safe:

- Requires at least 2 trend points.
- Requires `abs(summary.overallScore - latestTrendScore) <= 0.3`.
- Then:

```text
scoreDelta = round((latestTrendScore - previousTrendScore), 1 decimal)
```

Else `scoreDelta` is set to `undefined`.

## 4. Page-Level Derived Values (Display Logic)

In [app/page.tsx](app/page.tsx):

- `prevCycle`: previous trend cycle label when available.
- `lowestScore`: taken from `areaScores` for `summary.lowestArea`.
- `lowestPulsesAtRisk`: pulled from that same area row.
- `focusSuggestion`:
  1. exact match: recommendation `areaLink === summary.lowestArea`
  2. fallback fuzzy match on first word of area name in recommendation theme text

## 5. Component-Level Display Calculations

### Header

In [components/Header.tsx](components/Header.tsx):

- Formats `generatedDate` for display.
- Calculates participation string and rate:

```text
participationPct = round((totalResponses / teamSize) * 100)
```

- Calculates stale flag:

```text
isStale = (today - generatedDate) in days > 7
```

### Hero score badge logic

In [components/HeroScore.tsx](components/HeroScore.tsx):

- Delta direction flags:
  - up: `scoreDelta > 0`
  - down: `scoreDelta < 0`
  - flat: `scoreDelta === 0`
- Status label style selected from `statusConfig` by lowercased status.

### Signal strip

In [components/SignalStrip.tsx](components/SignalStrip.tsx):

- Shows only areas where `delta` exists.
- Displays arrows/sign from delta value.

### Score chart color banding

In [components/ScoreChart.tsx](components/ScoreChart.tsx):

- Color by score bands:
  - >= 4.0
  - >= 3.5
  - >= 3.0
  - below 3.0

### Response mix sentiment tag

In [components/ResponseMixChart.tsx](components/ResponseMixChart.tsx):

- `positive >= 65` => `Strong`
- `positive >= 50` => `Watch`
- else => `Concern`

### Role split visual emphasis

In [components/RoleSplitHeatmap.tsx](components/RoleSplitHeatmap.tsx):

- Cell tone is based on score band.
- Role gap text emphasis increases at `0.4`, `0.6`, `0.7` thresholds.

## 6. Notes and Caveats

1. Most business calculations happen in Apps Script; frontend mostly normalizes and formats.
2. There is one mismatch in comments vs reality:
   - [types/dashboard.ts](types/dashboard.ts) says frontend does not calculate anything.
   - In reality, frontend does compute several display-derived fields (`scoreDelta`, participation %, stale flag, focus suggestion fallback).
3. If you want strict single-source-of-truth, move those frontend derivations into Apps Script and keep frontend render-only.

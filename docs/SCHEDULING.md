# Canonical Scheduling (Kit-style)

This is the **app → cadence mapping** used in Kit’s self-awareness suite config.

The goal is to balance:
- **fast detection** for volatile signals (minutes/hours)
- **low noise** for slow-moving signals (days/weeks)
- **reasonable compute/cost**

## Tiers

### 1) Quick Pulse — every 30 minutes
**Why:** These signals can change quickly and are only useful if caught early.

- `drift-detection.js` (Personality Drift)
  - Drift can happen rapidly after long runs, context changes, or “mode switching”.
- `cognitive-mode.js` (Cognitive Mode)
  - State flips (creative/executive) happen within a day; timing matters.
- `energy-predictor.js` (Energy Predictor)
  - Crash windows shift inside a day; earlier warning actually prevents burnout.
- `decision-fatigue.js` (Decision Fatigue)
  - Decision load spikes quickly; intervention is time-sensitive.
- `stress-precursor.js` (Stress Precursor)
  - Early stress tells show up within hours; catching it late is just post-mortem.

### 2) Pattern Scan — every 2 hours
**Why:** These are accumulating patterns. You want them frequent enough to stay on top, but not spammy.

- `loop-hunter.js` (Loop Hunter)
- `commitment-tracker.js` (Commitment Tracker)
- `decision-tracker.js` (Decision Tracker)
- `learning-tracker.js` (Learning Tracker)
- `semantic-triggers.js` (Semantic Triggers)

### 3) Deep Analysis — every 6 hours
**Why:** Slower-moving synthesis + heavier queries. A few times/day is enough.

- `value-alignment.js` (Value Alignment)
- `partnership-health.js` (Partnership Health)
- `relationship-radar.js` (Relationship Radar)
- `recovery-tracker.js` (Recovery Tracker)
- `time-calibration.js` (Time Calibration)
- `recommendation-engine.js` (Recommendation Engine)

## Event-style triggers (non-cron)
If you wire “event triggers” (model switch / compaction / restart), run:
- `drift-detection.js`
- `cognitive-mode.js`

Optional (if you want more coverage on resets):
- `stress-precursor.js`
- `energy-predictor.js`

Reason: resets are where personality/mode instability is most likely to show up.

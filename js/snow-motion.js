const DEFAULT_THRESHOLD = 10.5;
const DEFAULT_HITS_REQUIRED = 2;
const DEFAULT_HIT_WINDOW_MS = 520;
const DEFAULT_MIN_HIT_INTERVAL_MS = 90;
const DEFAULT_COOLDOWN_MS = 1_400;
const DEFAULT_REARM_RATIO = .55;
const DEFAULT_GRAVITY_DELTA_SCALE = 2.4;

const CHARGE_VIBRATION_PATTERNS = Object.freeze([
  Object.freeze([10]),
  Object.freeze([18]),
  Object.freeze([28, 18, 28])
]);
const BOOM_VIBRATION_PATTERN = Object.freeze([70, 30, 110, 35, 160]);

function readVector(value) {
  if (value?.x == null || value?.y == null || value?.z == null) return null;

  const x = Number(value?.x);
  const y = Number(value?.y);
  const z = Number(value?.z);

  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)
    ? { x, y, z }
    : null;
}

function vectorMagnitude({ x, y, z }) {
  return Math.hypot(x, y, z);
}

export class ShakeDetector {
  constructor({
    threshold = DEFAULT_THRESHOLD,
    hitsRequired = DEFAULT_HITS_REQUIRED,
    hitWindowMs = DEFAULT_HIT_WINDOW_MS,
    minHitIntervalMs = DEFAULT_MIN_HIT_INTERVAL_MS,
    rearmThreshold = threshold * DEFAULT_REARM_RATIO,
    gravityDeltaScale = DEFAULT_GRAVITY_DELTA_SCALE,
    cooldownMs = DEFAULT_COOLDOWN_MS
  } = {}) {
    this.threshold = threshold;
    this.hitsRequired = hitsRequired;
    this.hitWindowMs = hitWindowMs;
    this.minHitIntervalMs = minHitIntervalMs;
    this.rearmThreshold = rearmThreshold;
    this.gravityDeltaScale = gravityDeltaScale;
    this.cooldownMs = cooldownMs;
    this.reset();
  }

  reset() {
    this.previousGravityVector = null;
    this.isArmed = true;
    this.resetSequence();
    this.lastTriggerAt = -Infinity;
  }

  resetSequence({ rearm = false } = {}) {
    this.hitCount = 0;
    this.lastHitAt = -Infinity;
    if (rearm) this.isArmed = true;
  }

  sample(event, timestamp = performance.now()) {
    return this.analyze(event, timestamp).triggered;
  }

  analyze(event, timestamp = performance.now()) {
    const linearAcceleration = readVector(event?.acceleration);
    const linearMagnitude = linearAcceleration
      ? vectorMagnitude(linearAcceleration)
      : null;
    const gravityVector = readVector(event?.accelerationIncludingGravity);
    const previousGravityVector = this.previousGravityVector;
    let gravityDeltaMagnitude = null;

    if (gravityVector) this.previousGravityVector = gravityVector;

    if (gravityVector && previousGravityVector) {
      const gravityDelta = vectorMagnitude({
        x: gravityVector.x - previousGravityVector.x,
        y: gravityVector.y - previousGravityVector.y,
        z: gravityVector.z - previousGravityVector.z
      });
      gravityDeltaMagnitude = gravityDelta * this.gravityDeltaScale;
    }

    const availableMagnitudes = [linearMagnitude, gravityDeltaMagnitude]
      .filter(Number.isFinite);

    return availableMagnitudes.length === 0
      ? this.createResult(0)
      : this.analyzeMagnitude(Math.max(...availableMagnitudes), Number(timestamp));
  }

  registerMagnitude(magnitude, timestamp) {
    return this.analyzeMagnitude(magnitude, timestamp).triggered;
  }

  analyzeMagnitude(magnitude, timestamp) {
    const safeMagnitude = Number.isFinite(magnitude) ? magnitude : 0;

    if (safeMagnitude < this.rearmThreshold) this.isArmed = true;

    if (
      Number.isFinite(timestamp)
      && this.hitCount > 0
      && timestamp - this.lastHitAt > this.hitWindowMs
    ) {
      this.resetSequence({ rearm: true });
    }

    if (!Number.isFinite(timestamp) || safeMagnitude < this.threshold) {
      return this.createResult(safeMagnitude);
    }

    if (!this.isArmed) return this.createResult(safeMagnitude);
    this.isArmed = false;

    if (timestamp - this.lastTriggerAt < this.cooldownMs) {
      this.resetSequence();
      return this.createResult(safeMagnitude);
    }

    if (timestamp - this.lastHitAt < this.minHitIntervalMs) {
      return this.createResult(safeMagnitude);
    }

    this.hitCount = timestamp - this.lastHitAt <= this.hitWindowMs
      ? this.hitCount + 1
      : 1;
    this.lastHitAt = timestamp;

    if (this.hitCount < this.hitsRequired) {
      return this.createResult(safeMagnitude, { registered: true });
    }

    const completedStage = this.hitsRequired;
    this.lastTriggerAt = timestamp;
    this.resetSequence();

    return this.createResult(safeMagnitude, {
      registered: true,
      triggered: true,
      stage: completedStage
    });
  }

  createResult(magnitude, {
    registered = false,
    triggered = false,
    stage = this.hitCount
  } = {}) {
    return {
      magnitude,
      registered,
      triggered,
      stage,
      progress: triggered ? 1 : Math.min(stage / this.hitsRequired, 1)
    };
  }
}

export function getSnowGlobeVibrationPattern(stage, { boom = false } = {}) {
  if (boom) return [...BOOM_VIBRATION_PATTERN];

  const normalizedStage = Math.trunc(Number(stage));
  if (!Number.isFinite(normalizedStage) || normalizedStage < 1) return [];

  const pattern = CHARGE_VIBRATION_PATTERNS[
    Math.min(normalizedStage, CHARGE_VIBRATION_PATTERNS.length) - 1
  ];

  return [...pattern];
}

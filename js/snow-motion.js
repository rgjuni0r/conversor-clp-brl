const DEFAULT_THRESHOLD = 10.5;
const DEFAULT_HITS_REQUIRED = 2;
const DEFAULT_HIT_WINDOW_MS = 520;
const DEFAULT_MIN_HIT_INTERVAL_MS = 90;
const DEFAULT_COOLDOWN_MS = 1_400;
const DEFAULT_REARM_RATIO = .55;
const DEFAULT_GRAVITY_DELTA_SCALE = 2.4;
const DEFAULT_DIRECTION_REARM_DOT = .2;
const DEFAULT_STIR_THRESHOLD = 6.5;
const DEFAULT_STIR_MAX_MAGNITUDE = 18;

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

function normalizeVector(vector) {
  if (!vector) return null;

  const magnitude = vectorMagnitude(vector);
  if (!Number.isFinite(magnitude) || magnitude <= 0) return null;

  return {
    x: vector.x / magnitude,
    y: vector.y / magnitude,
    z: vector.z / magnitude
  };
}

function vectorDot(first, second) {
  return first.x * second.x + first.y * second.y + first.z * second.z;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function readRandom(random) {
  const value = Number(random());
  return Number.isFinite(value) ? clamp(value, 0, 1) : .5;
}

export class ShakeDetector {
  constructor({
    threshold = DEFAULT_THRESHOLD,
    hitsRequired = DEFAULT_HITS_REQUIRED,
    hitWindowMs = DEFAULT_HIT_WINDOW_MS,
    minHitIntervalMs = DEFAULT_MIN_HIT_INTERVAL_MS,
    rearmThreshold = threshold * DEFAULT_REARM_RATIO,
    gravityDeltaScale = DEFAULT_GRAVITY_DELTA_SCALE,
    directionRearmDot = DEFAULT_DIRECTION_REARM_DOT,
    cooldownMs = DEFAULT_COOLDOWN_MS
  } = {}) {
    this.threshold = threshold;
    this.hitsRequired = hitsRequired;
    this.hitWindowMs = hitWindowMs;
    this.minHitIntervalMs = minHitIntervalMs;
    this.rearmThreshold = rearmThreshold;
    this.gravityDeltaScale = gravityDeltaScale;
    this.directionRearmDot = directionRearmDot;
    this.cooldownMs = cooldownMs;
    this.reset();
  }

  reset() {
    this.previousGravityVector = null;
    this.lastMotionVector = { x: 0, y: 0, z: 0 };
    this.lastRegisteredVector = null;
    this.isArmed = true;
    this.resetSequence();
    this.lastTriggerAt = -Infinity;
  }

  resetSequence({ rearm = false } = {}) {
    this.hitCount = 0;
    this.lastHitAt = -Infinity;
    if (rearm) {
      this.isArmed = true;
      this.lastRegisteredVector = null;
    }
  }

  getMotionVector() {
    return { ...this.lastMotionVector };
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
    let gravityDeltaVector = null;

    if (gravityVector) this.previousGravityVector = gravityVector;

    if (gravityVector && previousGravityVector) {
      gravityDeltaVector = {
        x: (gravityVector.x - previousGravityVector.x) * this.gravityDeltaScale,
        y: (gravityVector.y - previousGravityVector.y) * this.gravityDeltaScale,
        z: (gravityVector.z - previousGravityVector.z) * this.gravityDeltaScale
      };
    }

    const candidates = [
      linearAcceleration && Number.isFinite(linearMagnitude)
        ? { vector: linearAcceleration, magnitude: linearMagnitude }
        : null,
      gravityDeltaVector
        ? { vector: gravityDeltaVector, magnitude: vectorMagnitude(gravityDeltaVector) }
        : null
    ].filter(Boolean);

    const strongestMotion = candidates.reduce((strongest, candidate) => (
      !strongest || candidate.magnitude > strongest.magnitude ? candidate : strongest
    ), null);

    this.lastMotionVector = strongestMotion?.vector ?? { x: 0, y: 0, z: 0 };

    return !strongestMotion
      ? this.createResult(0)
      : this.analyzeMagnitude(strongestMotion.magnitude, Number(timestamp), {
        motionVector: strongestMotion.vector
      });
  }

  registerMagnitude(magnitude, timestamp) {
    return this.analyzeMagnitude(magnitude, timestamp).triggered;
  }

  analyzeMagnitude(magnitude, timestamp, { motionVector = null } = {}) {
    const safeMagnitude = Number.isFinite(magnitude) ? magnitude : 0;
    const normalizedMotionVector = normalizeVector(motionVector);

    if (
      !this.isArmed
      && normalizedMotionVector
      && this.lastRegisteredVector
      && Number.isFinite(timestamp)
      && timestamp - this.lastHitAt >= this.minHitIntervalMs
      && vectorDot(normalizedMotionVector, this.lastRegisteredVector) <= this.directionRearmDot
    ) {
      this.isArmed = true;
    }

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
    this.lastRegisteredVector = normalizedMotionVector;

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

export function createSnowGlobeFrame(
  { magnitude, vector },
  {
    activationThreshold = DEFAULT_STIR_THRESHOLD,
    maxMagnitude = DEFAULT_STIR_MAX_MAGNITUDE,
    random = Math.random
  } = {}
) {
  const safeMagnitude = Number.isFinite(Number(magnitude)) ? Math.max(0, Number(magnitude)) : 0;
  const safeVector = readVector(vector) ?? { x: 0, y: 0, z: 0 };
  const magnitudeRange = Math.max(.001, maxMagnitude - activationThreshold);
  const linearIntensity = clamp((safeMagnitude - activationThreshold) / magnitudeRange, 0, 1);
  const intensity = Math.sqrt(linearIntensity);

  if (intensity <= 0) {
    return {
      active: false,
      intensity: 0,
      offsetX: 0,
      offsetY: 0,
      rotation: 0,
      layerStart: 0,
      layerEnd: 0,
      extraDrift: 0,
      durationMs: 1_500
    };
  }

  const direction = normalizeVector(safeVector) ?? { x: 0, y: 0, z: 0 };
  const randomX = readRandom(random) * 2 - 1;
  const randomY = readRandom(random) * 2 - 1;
  const randomRotation = readRandom(random) * 2 - 1;
  const turbulence = .32 + intensity * .68;
  const offsetX = clamp(
    direction.x * 21 * intensity + randomX * 13 * turbulence,
    -30,
    30
  );
  const offsetY = clamp(
    -direction.y * 14 * intensity + randomY * 9 * turbulence,
    -20,
    20
  );
  const rotation = clamp(
    direction.z * 2.8 * intensity + randomRotation * 2.2 * turbulence,
    -4,
    4
  );

  return {
    active: true,
    intensity,
    offsetX,
    offsetY,
    rotation,
    layerStart: clamp(offsetX * -.42 + randomY * 5, -12, 12),
    layerEnd: clamp(offsetX * .48 + randomX * 6, -14, 14),
    extraDrift: clamp(offsetX * 1.5 + randomRotation * 16, -42, 42),
    durationMs: Math.round(1_450 - intensity * 850)
  };
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

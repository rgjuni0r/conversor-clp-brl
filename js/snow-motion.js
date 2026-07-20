const DEFAULT_THRESHOLD = 10.5;
const DEFAULT_HITS_REQUIRED = 2;
const DEFAULT_HIT_WINDOW_MS = 520;
const DEFAULT_COOLDOWN_MS = 1_400;

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
    cooldownMs = DEFAULT_COOLDOWN_MS
  } = {}) {
    this.threshold = threshold;
    this.hitsRequired = hitsRequired;
    this.hitWindowMs = hitWindowMs;
    this.cooldownMs = cooldownMs;
    this.reset();
  }

  reset() {
    this.previousGravityVector = null;
    this.hitCount = 0;
    this.lastHitAt = -Infinity;
    this.lastTriggerAt = -Infinity;
  }

  sample(event, timestamp = performance.now()) {
    const linearAcceleration = readVector(event?.acceleration);
    let magnitude;

    if (linearAcceleration && vectorMagnitude(linearAcceleration) > .01) {
      magnitude = vectorMagnitude(linearAcceleration);
    } else {
      const gravityVector = readVector(event?.accelerationIncludingGravity);
      if (!gravityVector) return false;

      if (!this.previousGravityVector) {
        this.previousGravityVector = gravityVector;
        return false;
      }

      magnitude = vectorMagnitude({
        x: gravityVector.x - this.previousGravityVector.x,
        y: gravityVector.y - this.previousGravityVector.y,
        z: gravityVector.z - this.previousGravityVector.z
      });
      this.previousGravityVector = gravityVector;
    }

    return this.registerMagnitude(magnitude, Number(timestamp));
  }

  registerMagnitude(magnitude, timestamp) {
    if (!Number.isFinite(timestamp) || magnitude < this.threshold) return false;

    if (timestamp - this.lastTriggerAt < this.cooldownMs) {
      this.hitCount = 0;
      return false;
    }

    this.hitCount = timestamp - this.lastHitAt <= this.hitWindowMs
      ? this.hitCount + 1
      : 1;
    this.lastHitAt = timestamp;

    if (this.hitCount < this.hitsRequired) return false;

    this.hitCount = 0;
    this.lastTriggerAt = timestamp;
    return true;
  }
}

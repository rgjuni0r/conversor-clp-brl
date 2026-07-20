import test from "node:test";
import assert from "node:assert/strict";

import { ShakeDetector } from "../js/snow-motion.js";

const motion = (x, y, z) => ({ acceleration: { x, y, z } });

test("ignora movimentos leves e exige dois impulsos próximos", () => {
  const detector = new ShakeDetector();

  assert.equal(detector.sample(motion(2, 1, 1), 100), false);
  assert.equal(detector.sample(motion(11, 2, 1), 200), false);
  assert.equal(detector.sample(motion(-12, 1, 2), 430), true);
});

test("não dispara novamente durante o cooldown", () => {
  const detector = new ShakeDetector();

  detector.sample(motion(12, 0, 0), 100);
  assert.equal(detector.sample(motion(-12, 0, 0), 300), true);
  assert.equal(detector.sample(motion(13, 0, 0), 600), false);
  assert.equal(detector.sample(motion(-13, 0, 0), 900), false);
  assert.equal(detector.sample(motion(13, 0, 0), 1_800), false);
  assert.equal(detector.sample(motion(-13, 0, 0), 2_000), true);
});

test("usa a variação com gravidade quando a aceleração linear não existe", () => {
  const detector = new ShakeDetector({ threshold: 8 });
  const sample = (x, y, z) => ({
    acceleration: { x: null, y: null, z: null },
    accelerationIncludingGravity: { x, y, z }
  });

  assert.equal(detector.sample(sample(0, 0, 9.8), 100), false);
  assert.equal(detector.sample(sample(10, 0, 1), 250), false);
  assert.equal(detector.sample(sample(-4, 8, 8), 450), true);
});

test("usa a variação com gravidade quando a aceleração linear vem zerada", () => {
  const detector = new ShakeDetector({ threshold: 8 });
  const sample = (x, y, z) => ({
    acceleration: { x: 0, y: 0, z: 0 },
    accelerationIncludingGravity: { x, y, z }
  });

  assert.equal(detector.sample(sample(0, 0, 9.8), 100), false);
  assert.equal(detector.sample(sample(11, 0, 1), 240), false);
  assert.equal(detector.sample(sample(-3, 8, 8), 420), true);
});

test("reinicia a sequência quando os impulsos ficam distantes", () => {
  const detector = new ShakeDetector({ hitWindowMs: 300 });

  assert.equal(detector.sample(motion(12, 0, 0), 100), false);
  assert.equal(detector.sample(motion(-12, 0, 0), 700), false);
  assert.equal(detector.sample(motion(12, 0, 0), 850), true);
});

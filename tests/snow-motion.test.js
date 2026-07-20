import test from "node:test";
import assert from "node:assert/strict";

import {
  createSnowGlobeFrame,
  ShakeDetector
} from "../js/snow-motion.js";

const motion = (x, y, z) => ({ acceleration: { x, y, z } });

test("ignora movimentos leves e exige dois impulsos próximos", () => {
  const detector = new ShakeDetector();

  assert.equal(detector.sample(motion(2, 1, 1), 100), false);
  assert.equal(detector.sample(motion(11, 2, 1), 200), false);
  assert.equal(detector.sample(motion(2, 1, 1), 300), false);
  assert.equal(detector.sample(motion(-12, 1, 2), 430), true);
});

test("não dispara novamente durante o cooldown", () => {
  const detector = new ShakeDetector();

  detector.sample(motion(12, 0, 0), 100);
  detector.sample(motion(0, 0, 0), 200);
  assert.equal(detector.sample(motion(-12, 0, 0), 300), true);
  detector.sample(motion(0, 0, 0), 450);
  assert.equal(detector.sample(motion(13, 0, 0), 600), false);
  detector.sample(motion(0, 0, 0), 750);
  assert.equal(detector.sample(motion(-13, 0, 0), 900), false);
  detector.sample(motion(0, 0, 0), 1_650);
  assert.equal(detector.sample(motion(13, 0, 0), 1_800), false);
  detector.sample(motion(0, 0, 0), 1_900);
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
  assert.equal(detector.sample(sample(10, 0, 1), 330), false);
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
  assert.equal(detector.sample(sample(11, 0, 1), 320), false);
  assert.equal(detector.sample(sample(-3, 8, 8), 420), true);
});

test("reinicia a sequência quando os impulsos ficam distantes", () => {
  const detector = new ShakeDetector({ hitWindowMs: 300 });

  assert.equal(detector.sample(motion(12, 0, 0), 100), false);
  assert.equal(detector.sample(motion(0, 0, 0), 600), false);
  assert.equal(detector.sample(motion(-12, 0, 0), 700), false);
  assert.equal(detector.sample(motion(0, 0, 0), 760), false);
  assert.equal(detector.sample(motion(12, 0, 0), 850), true);
});

test("expõe a progressão dos impulsos até o estouro", () => {
  const detector = new ShakeDetector({
    hitsRequired: 4,
    hitWindowMs: 1_200,
    minHitIntervalMs: 130
  });

  assert.deepEqual(
    detector.analyze(motion(12, 0, 0), 100),
    { magnitude: 12, registered: true, triggered: false, stage: 1, progress: .25 }
  );
  detector.analyze(motion(0, 0, 0), 180);
  assert.deepEqual(
    detector.analyze(motion(-12, 0, 0), 250),
    { magnitude: 12, registered: true, triggered: false, stage: 2, progress: .5 }
  );
  detector.analyze(motion(0, 0, 0), 330);
  assert.deepEqual(
    detector.analyze(motion(12, 0, 0), 400),
    { magnitude: 12, registered: true, triggered: false, stage: 3, progress: .75 }
  );
  detector.analyze(motion(0, 0, 0), 480);
  assert.deepEqual(
    detector.analyze(motion(-12, 0, 0), 550),
    { magnitude: 12, registered: true, triggered: true, stage: 4, progress: 1 }
  );
});

test("não conta quadros repetidos do mesmo impulso", () => {
  const detector = new ShakeDetector({
    hitsRequired: 3,
    minHitIntervalMs: 130
  });

  assert.equal(detector.analyze(motion(12, 0, 0), 100).stage, 1);

  const repeatedFrame = detector.analyze(motion(13, 0, 0), 180);
  assert.equal(repeatedFrame.registered, false);
  assert.equal(repeatedFrame.stage, 1);
  assert.equal(repeatedFrame.progress, 1 / 3);

  detector.analyze(motion(0, 0, 0), 210);
  assert.equal(detector.analyze(motion(-12, 0, 0), 250).stage, 2);
});

test("exige queda da aceleração antes de aceitar outro impulso", () => {
  const detector = new ShakeDetector({
    hitsRequired: 4,
    minHitIntervalMs: 130
  });

  assert.equal(detector.analyze(motion(12, 0, 0), 100).stage, 1);

  for (const timestamp of [230, 360, 490, 620]) {
    const sustainedMotion = detector.analyze(motion(12, 0, 0), timestamp);
    assert.equal(sustainedMotion.registered, false);
    assert.equal(sustainedMotion.triggered, false);
    assert.equal(sustainedMotion.stage, 1);
  }

  detector.analyze(motion(2, 0, 0), 700);
  const nextImpulse = detector.analyze(motion(-12, 0, 0), 850);
  assert.equal(nextImpulse.registered, true);
  assert.equal(nextImpulse.stage, 1);
});

test("rearma com inversões reais de direção durante uma agitação contínua", () => {
  const detector = new ShakeDetector({
    threshold: 8,
    hitsRequired: 4,
    minHitIntervalMs: 100,
    directionRearmDot: .2
  });

  const results = [
    detector.analyze(motion(9, 0, 0), 100),
    detector.analyze(motion(-9, 0, 0), 240),
    detector.analyze(motion(9, 0, 0), 380),
    detector.analyze(motion(-9, 0, 0), 520)
  ];

  assert.deepEqual(results.map(result => result.registered), [true, true, true, true]);
  assert.equal(results.at(-1).triggered, true);
  assert.deepEqual(detector.getMotionVector(), { x: -9, y: 0, z: 0 });
});

test("zera a progressão expirada e reinicia no primeiro nível", () => {
  const detector = new ShakeDetector({
    hitsRequired: 4,
    hitWindowMs: 500
  });

  assert.equal(detector.analyze(motion(12, 0, 0), 100).stage, 1);
  assert.equal(detector.analyze(motion(2, 0, 0), 700).stage, 0);
  assert.equal(detector.analyze(motion(-12, 0, 0), 800).stage, 1);
});

test("aceita o primeiro pico de uma nova sequência mesmo sem quadro leve anterior", () => {
  const detector = new ShakeDetector({
    threshold: 8,
    hitsRequired: 3,
    hitWindowMs: 300
  });

  assert.equal(detector.analyze(motion(9, 0, 0), 100).stage, 1);

  const restartedSequence = detector.analyze(motion(9, 0, 0), 450);
  assert.equal(restartedSequence.registered, true);
  assert.equal(restartedSequence.triggered, false);
  assert.equal(restartedSequence.stage, 1);
});

test("reconhece uma agitação moderada e mais espaçada", () => {
  const detector = new ShakeDetector({
    threshold: 8.2,
    hitsRequired: 4,
    hitWindowMs: 1_700,
    minHitIntervalMs: 100,
    rearmThreshold: 6
  });

  const sequence = [
    [motion(8.6, 0, 0), 100],
    [motion(5.8, 0, 0), 240],
    [motion(-8.7, 0, 0), 500],
    [motion(5.7, 0, 0), 700],
    [motion(8.4, 0, 0), 950],
    [motion(5.6, 0, 0), 1_170],
    [motion(-8.5, 0, 0), 1_500]
  ];

  const results = sequence.map(([event, timestamp]) => detector.analyze(event, timestamp));
  assert.deepEqual(
    results.filter(result => result.registered).map(result => result.stage),
    [1, 2, 3, 4]
  );
  assert.equal(results.at(-1).triggered, true);
});

test("amplifica mudanças moderadas do sensor com gravidade", () => {
  const detector = new ShakeDetector({
    threshold: 8.2,
    hitsRequired: 2,
    minHitIntervalMs: 100,
    gravityDeltaScale: 2.4
  });
  const gravityMotion = (x, y, z) => ({
    acceleration: { x: null, y: null, z: null },
    accelerationIncludingGravity: { x, y, z }
  });

  assert.equal(detector.sample(gravityMotion(0, 0, 9.8), 0), false);
  assert.equal(detector.sample(gravityMotion(3.5, 0, 9.8), 120), false);
  assert.equal(detector.sample(gravityMotion(3.5, 0, 9.8), 220), false);
  assert.equal(detector.sample(gravityMotion(0, 3.5, 9.8), 360), true);
});

test("não deixa ruído da aceleração linear ocultar o sensor com gravidade", () => {
  const detector = new ShakeDetector({
    threshold: 8.2,
    hitsRequired: 2,
    minHitIntervalMs: 100,
    gravityDeltaScale: 2.4
  });
  const noisyMotion = (gravityX, gravityY) => ({
    acceleration: { x: .02, y: 0, z: 0 },
    accelerationIncludingGravity: { x: gravityX, y: gravityY, z: 9.8 }
  });

  assert.equal(detector.sample(noisyMotion(0, 0), 0), false);
  assert.equal(detector.sample(noisyMotion(3.5, 0), 120), false);
  assert.equal(detector.sample(noisyMotion(3.5, 0), 220), false);
  assert.equal(detector.sample(noisyMotion(0, 3.5), 360), true);
});

test("ignora movimentos simples e cria turbulência somente com movimento intencional", () => {
  const simpleMovements = [.8, 2.5, 4.5, 6.4].map(magnitude => createSnowGlobeFrame({
    magnitude,
    vector: { x: magnitude, y: 0, z: 0 }
  }, { random: () => .5 }));
  const active = createSnowGlobeFrame({
    magnitude: 9,
    vector: { x: 9, y: 0, z: 0 }
  }, { random: () => .5 });

  assert.ok(simpleMovements.every(frame => frame.active === false));
  assert.equal(active.active, true);
  assert.ok(active.intensity > 0);
  assert.ok(active.offsetX > 0);
  assert.equal(active.offsetY, 0);
  assert.ok(active.durationMs < simpleMovements[0].durationMs);
});

test("varia a trajetória da neve mesmo para impulsos de mesma intensidade", () => {
  const values = [0, 1, 0, 1, 0, 1];
  const random = () => values.shift();
  const motionSample = { magnitude: 10, vector: { x: 4, y: 2, z: 1 } };
  const first = createSnowGlobeFrame(motionSample, { random });
  const second = createSnowGlobeFrame(motionSample, { random });

  assert.notEqual(first.offsetX, second.offsetX);
  assert.notEqual(first.offsetY, second.offsetY);
  assert.notEqual(first.rotation, second.rotation);
});

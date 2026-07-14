// cspell:words tanh libm

import {assert, check} from '@augment-vir/assert';
import {describe, it} from '@augment-vir/test';
import {
    computeAudioFingerprint,
    CpuArchitecture,
    detectCpuArchitecture,
    detectHyphenationDictionary,
    detectMathLibm,
    tanhAnchorValue,
} from './os-fingerprints.js';

const validSignBits: ReadonlyArray<number> = [
    0,
    1,
];

describe('os fingerprint detection', () => {
    it('detects a deterministic cpu architecture', () => {
        const result = detectCpuArchitecture();

        assert.deepEquals(result, detectCpuArchitecture());
        assert.isEnumValue(result.detected, CpuArchitecture);
        assert.isIn(result.jsSignBit, validSignBits);
        if (check.isDefined(result.wasmSignBit)) {
            assert.isIn(result.wasmSignBit, validSignBits);
        }
    });

    it('produces a deterministic, well-formed audio fingerprint', async () => {
        const first = await computeAudioFingerprint();
        const second = await computeAudioFingerprint();

        assert.strictEquals(first.sampleCount, 5000);
        assert.isFinite(first.sum);
        assert.isAbove(first.sum, 0);
        /** Determinism ("no noise") is the property the technique relies on. */
        assert.strictEquals(first.sum, second.sum);
    });

    it('detects a deterministic hyphenation dictionary', () => {
        const result = detectHyphenationDictionary();

        assert.deepEquals(result, detectHyphenationDictionary());
        [
            result.finnishAutoHeight,
            result.finnishBaselineHeight,
            result.latinAutoHeight,
            result.latinBaselineHeight,
        ].forEach((height) => {
            assert.isFinite(height);
            assert.isAbove(height, 0);
        });
    });

    it('detects a deterministic math libm signature', () => {
        const result = detectMathLibm();

        assert.deepEquals(result, detectMathLibm());
        assert.strictEquals(result.anchorTanh, tanhAnchorValue);
        result.probeTanh.forEach((value) => {
            assert.isFinite(value);
            assert.isAbove(value, 0);
            assert.isBelow(value, 1);
        });
    });
});

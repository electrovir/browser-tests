// cspell:words tanh libm

import {assert, checkWrap} from '@augment-vir/assert';
import {describe, it} from '@augment-vir/test';
import {
    browserRandomizesAudio,
    computeAudioFingerprint,
    CpuArchitecture,
    detectCpuArch,
    detectHyphenationDictionary,
    detectMathLibm,
    tanhAnchorValue,
} from './os-fingerprints.js';

describe('os fingerprint detection', () => {
    it('produces a deterministic, well-formed audio fingerprint', async () => {
        const first = await computeAudioFingerprint();
        const second = await computeAudioFingerprint();

        if (first == undefined) {
            /** Some engines (Playwright's WebKit on Windows) expose no OfflineAudioContext. */
            assert.isUndefined(second);
            return;
        }

        assert.isDefined(second);
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

    it('flags browsers that randomize their audio fingerprint', () => {
        assert.isTrue(browserRandomizesAudio('Safari'));
        assert.isFalse(browserRandomizesAudio('Chrome'));
        assert.isFalse(browserRandomizesAudio('Firefox'));
        assert.isFalse(browserRandomizesAudio(undefined));
    });

    it('detects a deterministic, valid cpu architecture when one is exposed', async () => {
        const first = await detectCpuArch();
        const second = await detectCpuArch();

        assert.strictEquals(first, second);
        if (first != undefined) {
            /** Engines without UA client hints (Safari, Firefox) return undefined instead. */
            assert.isDefined(checkWrap.isEnumValue(first, CpuArchitecture));
        }
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

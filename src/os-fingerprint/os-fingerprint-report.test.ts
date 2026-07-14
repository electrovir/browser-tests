import {assert} from '@augment-vir/assert';
import {describe, it} from '@augment-vir/test';
import {classifyFingerprint, runOsFingerprints} from './os-fingerprint-report.js';
import {FingerprintVerdict, HyphenationDictionary} from './os-fingerprints.js';

describe('os fingerprint report', () => {
    /**
     * Emits every measurement for the current OS + browser to the console. Reading the "Browser
     * logs" section of the GitHub Actions matrix (macOS/Ubuntu/Windows × chromium/webkit/firefox)
     * yields the full cross-platform fingerprint table to fill the reference with.
     */
    it('logs raw fingerprint data for the current os and browser', async () => {
        const report = await runOsFingerprints();
        // eslint-disable-next-line no-console
        console.log('OS_FINGERPRINT_DATA ' + JSON.stringify(report));
        assert.isNotEmpty(report.groundTruth.userAgent);
    });

    it('never flags a real, unaltered browser as a mismatch', async () => {
        const report = await runOsFingerprints();

        /**
         * Playwright's WebKit build reports a macOS Safari user agent on every host OS, so on the
         * Linux and Windows CI runners it is a genuinely spoofed environment (a non-Apple machine
         * claiming to be macOS Safari) that the detector is correct to flag. Real Safari only runs
         * on Apple platforms, where this engine reports a match. Skip it so the invariant is
         * asserted only for engines the harness runs on their native OS.
         */
        if (report.groundTruth.browserName === 'Safari') {
            return;
        }

        report.comparisons.forEach((comparison) => {
            /** A real human on an unaltered browser must never look like a spoofed user agent. */
            assert.notStrictEquals(comparison.verdict, FingerprintVerdict.Mismatch);
        });
    });

    it('classifies a value against the versioned reference', () => {
        const allKnown = [
            HyphenationDictionary.Apple,
            HyphenationDictionary.Minikin,
            HyphenationDictionary.Bundled,
        ];

        /** An observation of the exact claimed version produces this value → confirmed match. */
        assert.strictEquals(
            classifyFingerprint({
                live: HyphenationDictionary.Apple,
                exactValues: [HyphenationDictionary.Apple],
                anyValues: [HyphenationDictionary.Apple],
                allKnown,
                isMatch: (candidate) => candidate === HyphenationDictionary.Apple,
            }),
            FingerprintVerdict.Match,
        );

        /** Known for the browser but no observation for this exact version → unverified. */
        assert.strictEquals(
            classifyFingerprint({
                live: HyphenationDictionary.Apple,
                exactValues: [],
                anyValues: [HyphenationDictionary.Apple],
                allKnown,
                isMatch: (candidate) => candidate === HyphenationDictionary.Apple,
            }),
            FingerprintVerdict.Unverified,
        );

        /** The value belongs only to a different browser + OS → the user agent is lying. */
        assert.strictEquals(
            classifyFingerprint({
                live: HyphenationDictionary.Minikin,
                exactValues: [HyphenationDictionary.Apple],
                anyValues: [HyphenationDictionary.Apple],
                allKnown,
                isMatch: (candidate) => candidate === HyphenationDictionary.Minikin,
            }),
            FingerprintVerdict.Mismatch,
        );

        /** The claimed browser + OS has no captured observations to compare against. */
        assert.strictEquals(
            classifyFingerprint({
                live: HyphenationDictionary.Apple,
                exactValues: [],
                anyValues: [],
                allKnown,
                isMatch: (candidate) => candidate === HyphenationDictionary.Apple,
            }),
            FingerprintVerdict.NoReference,
        );
    });
});

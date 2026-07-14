// cspell:words libm

import {assert, assertWrap} from '@augment-vir/assert';
import {describe, it} from '@augment-vir/test';
import {
    classifyFingerprint,
    formatOsFingerprintReport,
    guessActualCombo,
    runOsFingerprints,
} from './os-fingerprint-report.js';
import {
    browserRandomizesAudio,
    CpuArchitecture,
    FingerprintVerdict,
    HyphenationDictionary,
    LibmSignature,
    OsFingerprintType,
} from './os-fingerprints.js';

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

    it('marks a randomized audio signal as no-reference, never a mismatch', async () => {
        const report = await runOsFingerprints();
        const audioComparison = assertWrap.isDefined(
            report.comparisons.find((comparison) => comparison.type === OsFingerprintType.Audio),
        );

        /**
         * Safari re-seeds its audio noise every session (the harness runs it via Playwright's
         * WebKit, which reports a Safari user agent), so audio is never comparable there. Every
         * other engine has a stable audio sum and must not be marked randomized.
         */
        assert.strictEquals(
            audioComparison.randomized,
            browserRandomizesAudio(report.groundTruth.browserName),
        );
        if (audioComparison.randomized) {
            /** Randomized audio has nothing to compare against, so its verdict is no-reference. */
            assert.strictEquals(audioComparison.verdict, FingerprintVerdict.NoReference);
        }
        /** A real, unaltered browser must never be flagged, randomized audio or not. */
        assert.notStrictEquals(audioComparison.verdict, FingerprintVerdict.Mismatch);
    });

    it('classifies a value against every known value for the browser + os', () => {
        /** A value the claimed browser + OS produces → match, even without an exact-version row. */
        assert.strictEquals(
            classifyFingerprint({
                live: HyphenationDictionary.Apple,
                claimedValues: [HyphenationDictionary.Apple],
                isMatch: (candidate) => candidate === HyphenationDictionary.Apple,
            }),
            FingerprintVerdict.Match,
        );

        /** A value the claimed browser + OS never produces → the user agent is lying. */
        assert.strictEquals(
            classifyFingerprint({
                live: HyphenationDictionary.Minikin,
                claimedValues: [HyphenationDictionary.Apple],
                isMatch: (candidate) => candidate === HyphenationDictionary.Minikin,
            }),
            FingerprintVerdict.Mismatch,
        );

        /** Nothing detected while the claimed browser + OS does produce a value → also a lie. */
        assert.strictEquals(
            classifyFingerprint({
                live: undefined,
                claimedValues: [HyphenationDictionary.Apple],
                isMatch: () => false,
            }),
            FingerprintVerdict.Mismatch,
        );

        /** The claimed browser + OS has no captured observations to compare against. */
        assert.strictEquals(
            classifyFingerprint({
                live: HyphenationDictionary.Apple,
                claimedValues: [],
                isMatch: (candidate) => candidate === HyphenationDictionary.Apple,
            }),
            FingerprintVerdict.NoReference,
        );
    });

    it('formats a copyable plain-text report of everything measured', () => {
        const text = formatOsFingerprintReport({
            groundTruth: {
                userAgent: 'test-ua',
                osName: 'macOS',
                browserName: 'Safari',
                browserVersion: '26.5.2',
            },
            detectedCpuArch: undefined,
            claimedReference: undefined,
            comparisons: [
                {
                    type: OsFingerprintType.Audio,
                    label: 'audio fingerprint',
                    detected: '956.1319',
                    expected: [],
                    randomized: true,
                    verdict: FingerprintVerdict.NoReference,
                },
                {
                    type: OsFingerprintType.Hyphenation,
                    label: 'hyphenation dictionary',
                    detected: 'apple',
                    expected: ['apple'],
                    randomized: false,
                    verdict: FingerprintVerdict.Match,
                },
            ],
            actualGuess: undefined,
        });

        assert.strictEquals(
            text,
            [
                'OS Fingerprint Report',
                '',
                'User agent: test-ua',
                'OS: macOS',
                'Browser: Safari',
                'Version: 26.5.2',
                'CPU architecture: unknown',
                '',
                'Fingerprints:',
                '- audio fingerprint: randomized (expected: random) → no reference',
                '- hyphenation dictionary: apple (expected: apple) → match',
            ].join('\n'),
        );
    });

    it('guesses the real browser + os behind a spoofed user agent', () => {
        /**
         * Linux Chrome fingerprints while claiming macOS Chrome → the guess should name Linux
         * Chrome.
         */
        assert.strictEquals(
            guessActualCombo({
                detected: {
                    cpuArch: CpuArchitecture.X86,
                    hyphenation: HyphenationDictionary.Minikin,
                    libm: LibmSignature.Glibc,
                    audio: 956.3164,
                },
                claimedOsName: 'macOS',
                claimedBrowserName: 'Chrome',
            }),
            'Linux Chrome',
        );
    });
});

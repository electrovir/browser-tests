import {assert, assertWrap} from '@augment-vir/assert';
import {describe, it} from '@augment-vir/test';
import {DetectionRating} from '../rebrowser/rebrowser-detections.js';
import {
    BotSignalType,
    BotVerdict,
    runBotDetections,
    verdictFromSignalCounts,
} from './are-you-a-bot-detections.js';

describe('are you a bot detections', () => {
    it('produces a well-formed report covering every signal', async () => {
        const report = await runBotDetections();

        assert.isEnumValue(report.verdict, BotVerdict);
        assert.isLengthExactly(report.signals, Object.values(BotSignalType).length);

        const reportedTypes = report.signals.map((signal) => signal.type);
        Object.values(BotSignalType).forEach((type) => {
            assert.isIn(type, reportedTypes);
        });

        report.signals.forEach((signal) => {
            assert.isEnumValue(signal.rating, DetectionRating);
            assert.isNotEmpty(signal.note);
        });
    });

    it('accepts the navigator.vendor every real engine reports', async () => {
        const report = await runBotDetections();
        const vendorSignal = assertWrap.isDefined(
            report.signals.find((signal) => signal.type === BotSignalType.NavigatorVendor),
        );

        /** Chromium, WebKit, and Gecko each report their engine's constant, so none may be flagged. */
        assert.strictEquals(vendorSignal.rating, DetectionRating.Pass);
    });

    it('never calls a real browser out over apple pay', async () => {
        const report = await runBotDetections();
        const applePaySignal = assertWrap.isDefined(
            report.signals.find((signal) => signal.type === BotSignalType.ApplePay),
        );

        /**
         * Playwright's WebKit claims macOS Safari without shipping Apple Pay, which earns the weak
         * warning; the conclusive rating is reserved for Apple Pay appearing where it cannot
         * exist.
         */
        assert.notStrictEquals(applePaySignal.rating, DetectionRating.Detected);
    });

    it('aggregates weak and strong signals into a verdict', () => {
        assert.strictEquals(
            verdictFromSignalCounts({
                strong: 0,
                weak: 0,
            }),
            BotVerdict.Human,
        );
        assert.strictEquals(
            verdictFromSignalCounts({
                strong: 0,
                weak: 1,
            }),
            BotVerdict.Suspicious,
        );
        assert.strictEquals(
            verdictFromSignalCounts({
                strong: 0,
                weak: 2,
            }),
            BotVerdict.Bot,
        );
        assert.strictEquals(
            verdictFromSignalCounts({
                strong: 1,
                weak: 0,
            }),
            BotVerdict.Bot,
        );
    });
});

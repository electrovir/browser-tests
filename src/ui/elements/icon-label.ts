/** Non-breaking space (U+00A0) that keeps an icon glued to the first word of its label. */
const nonBreakingSpace = String.fromCodePoint(160);

/**
 * Glues an icon to the start of its label with a non-breaking space so the icon never wraps onto
 * its own line. Any later words in the label still wrap normally.
 */
export function iconLabel({icon, label}: Readonly<{icon: string; label: string}>): string {
    return [
        icon,
        label,
    ].join(nonBreakingSpace);
}

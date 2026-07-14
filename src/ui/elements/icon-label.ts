import {css, html} from 'element-vir';

/** Shared styles for {@link iconLabel}; include in each consuming element's `styles`. */
export const iconLabelStyles = css`
    .icon-label-start {
        white-space: nowrap;
    }

    .icon-label-icon {
        font-size: 0.85em;
    }
`;

/**
 * Renders an icon before its label. The icon and the first word are kept together on one line so
 * the icon never wraps off on its own, while any later words still wrap normally. The icon is
 * rendered slightly smaller so a tall emoji glyph never makes a table row taller than its text.
 */
export function iconLabel({icon, label}: Readonly<{icon: string; label: string}>) {
    const [
        firstWord = '',
        ...restWords
    ] = label.split(' ');
    return html`
        <span class="icon-label-start">
            <span class="icon-label-icon">${icon}</span>
            ${firstWord}
        </span>
        ${restWords.join(' ')}
    `;
}

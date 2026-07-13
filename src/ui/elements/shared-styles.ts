import {css} from 'element-vir';
import {viraTheme} from 'vira';

/**
 * Table and code styles shared by the test-panel elements, which each live in their own shadow
 * root.
 */
export const testPanelStyles = css`
    code {
        font-family: monospace;
    }

    table {
        border-collapse: collapse;
        margin-top: 16px;
    }

    th,
    td {
        padding: 4px 12px;
        border: 1px solid ${viraTheme.colors['vira-grey-foreground-decoration'].foreground.value};
        text-align: left;
    }
`;

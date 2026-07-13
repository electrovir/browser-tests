import {css, defineElement, html} from 'element-vir';
import {VirPersistenceTests} from './vir-persistence-tests.element.js';
import {VirRebrowserTests} from './vir-rebrowser-tests.element.js';

export const VirApp = defineElement()({
    tagName: 'vir-app',
    styles: css`
        :host {
            display: block;
            padding: 24px;
            font-family: sans-serif;
        }

        .panels {
            display: flex;
            flex-direction: row;
            flex-wrap: wrap;
            gap: 32px;
            align-items: flex-start;

            > * {
                flex-grow: 1;
                flex-shrink: 1;
                min-width: 380px;
                max-width: 820px;
            }
        }
    `,
    render() {
        return html`
            <div class="panels">
                <${VirPersistenceTests}></${VirPersistenceTests}>
                <${VirRebrowserTests}></${VirRebrowserTests}>
            </div>
        `;
    },
});

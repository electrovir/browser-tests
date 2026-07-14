import {randomString} from '@augment-vir/common';
import {css, defineElement, html} from 'element-vir';
import {ViraError, viraTheme} from 'vira';
import {
    PersistenceMode,
    runPersistenceTests,
    type PersistenceRunResult,
} from '../../persistence/run-persistence-tests.js';
import {testPanelStyles} from './shared-styles.js';

declare global {
    interface Window {
        /** Populated once a seed/verify run finishes, so automation can read the result. */
        persistenceTestResult?: PersistenceRunResult | undefined;
    }
}

enum RunStatus {
    Idle = 'idle',
    Running = 'running',
    Done = 'done',
}

function parseMode(search: string): PersistenceMode | undefined {
    const modeParam = new URLSearchParams(search).get('mode');
    return Object.values(PersistenceMode).find((candidate) => candidate === modeParam);
}

function renderResult(result: PersistenceRunResult) {
    return html`
        <table>
            <thead>
                <tr>
                    <th>mechanism</th>
                    <th>${result.mode}</th>
                </tr>
            </thead>
            <tbody>
                ${result.reports.map(
                    (report) => html`
                        <tr>
                            <td>${report.label}</td>
                            <td>
                                ${report.ok ? '✅' : '❌'}
                                ${report.error
                                    ? html`
                                          <${ViraError}>${report.error}</${ViraError}>
                                      `
                                    : ''}
                            </td>
                        </tr>
                    `,
                )}
            </tbody>
        </table>
        <pre class="json">${JSON.stringify(result, undefined, 2)}</pre>
    `;
}

export const VirPersistenceTests = defineElement()({
    tagName: 'vir-persistence-tests',
    styles: css`
        :host {
            display: block;
        }

        ${testPanelStyles}

        nav {
            display: flex;
            gap: 16px;
            margin: 16px 0;
        }

        .json {
            margin-top: 16px;
            padding: 12px;
            overflow: auto;
            background: ${viraTheme.colors['vira-grey-behind-fg-small-body'].background.value};
        }
    `,
    state: () => {
        const params = new URLSearchParams(window.location.search);
        return {
            status: RunStatus.Idle,
            marker: params.get('marker') || randomString(),
            result: undefined as PersistenceRunResult | undefined,
        };
    },
    init({state, updateState}) {
        const mode = parseMode(window.location.search);
        if (!mode) {
            return;
        }
        updateState({
            status: RunStatus.Running,
        });
        void runPersistenceTests({
            mode,
            marker: state.marker,
        })
            .then((result) => {
                window.persistenceTestResult = result;
                document.title = `Data Persistence — ${mode} complete`;
                updateState({
                    status: RunStatus.Done,
                    result,
                });
            })
            .catch((error: unknown) => {
                console.error(error);
                document.title = 'Data Persistence — failed';
                updateState({
                    status: RunStatus.Done,
                });
            });
    },
    render({state}) {
        return html`
            <h1>Data Persistence</h1>
            <p>
                current marker:
                <code>${state.marker}</code>
            </p>
            <nav>
                <a href="?mode=${PersistenceMode.Seed}&marker=${state.marker}">Run seed</a>
                <a href="?mode=${PersistenceMode.Verify}&marker=${state.marker}">Run verify</a>
            </nav>
            ${state.status === RunStatus.Running
                ? html`
                      <p>Running…</p>
                  `
                : ''}
            ${state.result ? renderResult(state.result) : ''}
        `;
    },
});

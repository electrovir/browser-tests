import {check} from '@augment-vir/assert';
import {
    PersistenceMechanism,
    persistenceMechanismLabels,
    persistenceTests,
    type PersistenceTest,
} from './persistence-mechanisms.js';

export enum PersistenceMode {
    Seed = 'seed',
    Verify = 'verify',
}

export type MechanismReport = Readonly<{
    mechanism: PersistenceMechanism;
    label: string;
    /** Seed mode: the marker was written without error. Verify mode: the marker was read back. */
    ok: boolean;
    error: string | undefined;
}>;

export type PersistenceEnvironment = Readonly<{
    persistentStorage: boolean | undefined;
    quotaBytes: number | undefined;
    usageBytes: number | undefined;
}>;

export type PersistenceRunResult = Readonly<{
    mode: PersistenceMode;
    marker: string;
    environment: PersistenceEnvironment;
    reports: ReadonlyArray<MechanismReport>;
}>;

const modeRunners: Record<
    PersistenceMode,
    (test: PersistenceTest, marker: string) => Promise<boolean>
> = {
    [PersistenceMode.Seed]: async (test, marker) => {
        await test.seed(marker);
        return true;
    },
    [PersistenceMode.Verify]: (test, marker) => Promise.resolve(test.verify(marker)),
};

async function runMechanism({
    mode,
    marker,
    mechanism,
}: Readonly<{
    mode: PersistenceMode;
    marker: string;
    mechanism: PersistenceMechanism;
}>): Promise<MechanismReport> {
    try {
        const ok = await modeRunners[mode](persistenceTests[mechanism], marker);
        return {
            mechanism,
            label: persistenceMechanismLabels[mechanism],
            ok,
            error: undefined,
        };
    } catch (caught) {
        return {
            mechanism,
            label: persistenceMechanismLabels[mechanism],
            ok: false,
            error: check.isError(caught) ? caught.message : 'unknown error',
        };
    }
}

/** Best-effort storage diagnostics that help explain why quota-managed stores may be unavailable. */
async function gatherEnvironment(): Promise<PersistenceEnvironment> {
    /** Navigator.storage is `undefined` outside HTTPS (dev HTTP on non-localhost). */
    const storage = navigator.storage as StorageManager | undefined;
    const persistentStorage = await storage?.persisted().catch(() => undefined);
    const estimate = await storage?.estimate().catch(() => undefined);
    return {
        persistentStorage,
        quotaBytes: estimate?.quota,
        usageBytes: estimate?.usage,
    };
}

export async function runPersistenceTests({
    mode,
    marker,
}: Readonly<{mode: PersistenceMode; marker: string}>): Promise<PersistenceRunResult> {
    const reports = await Promise.all(
        Object.values(PersistenceMechanism).map((mechanism) =>
            runMechanism({
                mode,
                marker,
                mechanism,
            }),
        ),
    );
    return {
        mode,
        marker,
        environment: await gatherEnvironment(),
        reports,
    };
}

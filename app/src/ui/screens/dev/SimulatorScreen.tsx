import { useEffect, useMemo, useState } from 'react';
import {
  exactRarityDistribution,
  simulateBoosters,
  type SimulationResult,
} from '../../../domain/distribution.ts';
import { createSeededRng } from '../../../domain/rng.ts';
import { boosterType } from '../../../domain/roll.ts';
import { useGame } from '../../../store/GameProvider.tsx';
import { Button } from '../../components/Button.tsx';
import { RarityIcon } from '../../components/RarityIcon.tsx';
import { formatPercent } from '../../format.ts';
import styles from './DevScreens.module.css';

const DRAWS = 100_000;
const CHUNK = 10_000;

function merge(a: SimulationResult | null, b: SimulationResult): SimulationResult {
  if (!a) return b;
  const add = <K extends string>(x: Record<K, number>, y: Record<K, number>) =>
    Object.fromEntries(Object.keys(x).map((k) => [k, x[k as K] + y[k as K]])) as Record<K, number>;
  return {
    draws: a.draws + b.draws,
    rarity: add(a.rarity, b.rarity),
    finish: add(a.finish, b.finish),
    smoke: add(a.smoke, b.smoke),
    baseTier: a.baseTier.map((v, i) => v + (b.baseTier[i] ?? 0)),
    distinctPuffs: Math.max(a.distinctPuffs, b.distinctPuffs),
  };
}

/** /dev/simulateur: opens 100 000 boosters with the current config and shows the distribution. */
export default function SimulatorScreen() {
  const { catalog, config } = useGame();
  const [seed, setSeed] = useState(1);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const type = boosterType(config, config.defaultBoosterType);
  const exact = useMemo(
    () => exactRarityDistribution(catalog, type, config),
    [catalog, type, config],
  );

  // Runs in chunks so the page stays responsive.
  useEffect(() => {
    const rng = createSeededRng(seed);
    let done = 0;
    let acc: SimulationResult | null = null;
    let id = 0;
    const step = () => {
      acc = merge(acc, simulateBoosters(catalog, type, config, rng, CHUNK));
      done += CHUNK;
      setResult(acc);
      if (done < DRAWS) id = window.setTimeout(step, 0);
    };
    id = window.setTimeout(step, 0);
    return () => window.clearTimeout(id);
  }, [seed, catalog, type, config]);

  const draws = result?.draws ?? 0;
  const pct = (n: number) => (draws > 0 ? n / draws : 0);

  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>Simulateur</h1>
      <p className={styles.muted}>
        {type.name} · {draws.toLocaleString('fr-FR')} / {DRAWS.toLocaleString('fr-FR')} ouvertures ·
        graine {seed}. Réglages : <code>src/config/gameConfig.ts</code>.
      </p>
      <Button variant="secondary" size="sm" onClick={() => setSeed((s) => s + 1)}>
        Relancer avec une autre graine
      </Button>

      <section className={styles.section}>
        <h2>Rareté globale</h2>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Palier</th>
              <th scope="col">Points min</th>
              <th scope="col">Simulé</th>
              <th scope="col">Exact</th>
              <th scope="col">Fréquence</th>
            </tr>
          </thead>
          <tbody>
            {config.rarities.map((r) => {
              const p = pct(result?.rarity[r.id] ?? 0);
              return (
                <tr key={r.id}>
                  <th scope="row">
                    <span className={styles.tierCell} style={{ color: r.color }}>
                      <RarityIcon icon={r.icon} size={14} /> {r.name}
                    </span>
                    <span
                      className={styles.bar}
                      style={{ width: `${Math.max(1, p * 100)}%`, background: r.color }}
                    />
                  </th>
                  <td>{r.minPoints}</td>
                  <td>{formatPercent(p, 2)}</td>
                  <td>{formatPercent(exact[r.id], 2)}</td>
                  <td>
                    1 / {(1 / exact[r.id]).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <div className={styles.columns}>
        <section className={styles.section}>
          <h2>Finitions</h2>
          <table className={styles.table}>
            <tbody>
              {config.finishes.map((f) => (
                <tr key={f.id}>
                  <th scope="row">
                    {f.name} <small>(+{f.points})</small>
                  </th>
                  <td>{formatPercent(pct(result?.finish[f.id] ?? 0), 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className={styles.section}>
          <h2>Fumées</h2>
          <table className={styles.table}>
            <tbody>
              {config.smokes.map((s) => (
                <tr key={s.kind}>
                  <th scope="row">
                    {s.name} <small>(+{s.points})</small>
                  </th>
                  <td>{formatPercent(pct(result?.smoke[s.kind] ?? 0), 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className={styles.section}>
          <h2>Paliers de base</h2>
          <table className={styles.table}>
            <tbody>
              {config.baseTiers.tiers.map((t, i) => (
                <tr key={t.name}>
                  <th scope="row">
                    {t.name}{' '}
                    <small>
                      (+{t.points}, {catalog.byBaseTier[i]?.length ?? 0} puffs)
                    </small>
                  </th>
                  <td>{formatPercent(pct(result?.baseTier[i] ?? 0), 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}

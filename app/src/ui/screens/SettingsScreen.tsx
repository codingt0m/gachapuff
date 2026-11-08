import { useRef, useState } from 'react';
import { cleanPseudo, PSEUDO_MAX } from '../../domain/save.ts';
import type { MotionPreference } from '../../domain/types.ts';
import { useGame, useGameState } from '../../store/GameProvider.tsx';
import { Button } from '../components/Button.tsx';
import { ConfirmDialog } from '../components/ConfirmDialog.tsx';
import { Icon } from '../components/Icons.tsx';
import { Switch } from '../components/Switch.tsx';
import { useToast } from '../components/Toast.tsx';
import { feedback } from '../feedback.ts';
import { paths } from '../router.ts';
import styles from './SettingsScreen.module.css';

const MOTION_OPTIONS: { value: MotionPreference; label: string }[] = [
  { value: 'system', label: 'Comme mon appareil' },
  { value: 'full', label: 'Toutes' },
  { value: 'reduced', label: 'Réduites' },
];

function download(fileName: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export default function SettingsScreen() {
  const store = useGame();
  const settings = useGameState((s) => s.settings);
  const stats = useGameState((s) => s.stats);
  const collectionSize = useGameState((s) => s.collection.length);
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [pseudo, setPseudo] = useState(settings.pseudo ?? '');

  const savePseudo = () => {
    const clean = cleanPseudo(pseudo);
    setPseudo(clean ?? '');
    if (clean === settings.pseudo) return;
    store.updateSettings({ pseudo: clean });
    if (clean) toast(`Pseudo enregistré : ${clean}`, 'success');
  };

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    const result = store.importSave(await file.text());
    if (result.ok) {
      feedback('success');
      toast('Sauvegarde importée !', 'success');
    } else {
      feedback('error');
      toast(result.error, 'warning');
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>Réglages</h1>

      <section className={styles.card} aria-labelledby="s-profile">
        <h2 id="s-profile" className={styles.cardTitle}>
          Profil
        </h2>
        <label className={styles.field}>
          <span className={styles.label}>Pseudo</span>
          <input
            type="text"
            value={pseudo}
            maxLength={PSEUDO_MAX}
            autoComplete="nickname"
            placeholder="Ton pseudo"
            onChange={(e) => setPseudo(e.target.value)}
            onBlur={savePseudo}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
          />
        </label>
        <p className={styles.muted}>
          Une puff signée sur cinq porte la signature de celui qui l’a tirée : la tienne.
        </p>
      </section>

      <section className={styles.card} aria-labelledby="s-feel">
        <h2 id="s-feel" className={styles.cardTitle}>
          Sensations
        </h2>
        <Switch
          label="Sons"
          description="Bruitages synthétisés, jamais avant ta première action."
          checked={settings.sound}
          onChange={(sound) => store.updateSettings({ sound })}
        />
        <Switch
          label="Vibrations"
          description="Retours haptiques (si ton téléphone les gère)."
          checked={settings.haptics}
          onChange={(haptics) => store.updateSettings({ haptics })}
        />
        <fieldset className={styles.radios}>
          <legend className={styles.label}>Animations</legend>
          {MOTION_OPTIONS.map((o) => (
            <label key={o.value} className={styles.radio}>
              <input
                type="radio"
                name="motion"
                value={o.value}
                checked={settings.motion === o.value}
                onChange={() => {
                  feedback('tick');
                  store.updateSettings({ motion: o.value });
                }}
              />
              <span>{o.label}</span>
            </label>
          ))}
        </fieldset>
      </section>

      <section className={styles.card} aria-labelledby="s-save">
        <h2 id="s-save" className={styles.cardTitle}>
          Sauvegarde
        </h2>
        <p className={styles.muted}>
          Ta collection vit dans ce navigateur (
          {store.storageKind === 'indexeddb' ? 'IndexedDB' : 'mémoire seulement'}).
        </p>
        <div className={styles.buttons}>
          <Button
            variant="secondary"
            icon={<Icon name="download" size={20} />}
            onClick={() => {
              const { fileName, text } = store.exportSave();
              download(fileName, text);
              toast('Sauvegarde exportée.', 'success');
            }}
          >
            Exporter
          </Button>
          <Button
            variant="secondary"
            icon={<Icon name="upload" size={20} />}
            onClick={() => fileRef.current?.click()}
          >
            Importer
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="visually-hidden"
            tabIndex={-1}
            onChange={(e) => void onImport(e.target.files?.[0])}
          />
          <Button
            variant="danger"
            icon={<Icon name="trash" size={20} />}
            onClick={() => setConfirmReset(true)}
          >
            Réinitialiser
          </Button>
        </div>
      </section>

      <section className={styles.card} aria-labelledby="s-stats">
        <h2 id="s-stats" className={styles.cardTitle}>
          Statistiques
        </h2>
        <dl className={styles.stats}>
          <div>
            <dt>Boosters ouverts</dt>
            <dd>{stats.opened}</dd>
          </div>
          <div>
            <dt>Fusions</dt>
            <dd>{stats.recycled}</dd>
          </div>
          <div>
            <dt>Puffs possédées</dt>
            <dd>{collectionSize}</dd>
          </div>
        </dl>
      </section>

      {store.dev && (
        <section className={styles.card} aria-labelledby="s-dev">
          <h2 id="s-dev" className={styles.cardTitle}>
            Outils de dev
          </h2>
          <ul className={styles.links}>
            <li>
              <a href={paths.design}>Design system</a>
            </li>
            <li>
              <a href={paths.showcase}>Vitrine des rendus</a>
            </li>
            <li>
              <a href={paths.simulator}>Simulateur de probabilités</a>
            </li>
          </ul>
        </section>
      )}

      <p className={styles.about}>
        Gachapuff v{__APP_VERSION__} · version de test locale, sans compte ni serveur. Aucun achat,
        aucune pub.
      </p>

      <ConfirmDialog
        open={confirmReset}
        title="Tout effacer ?"
        confirmLabel="Effacer ma collection"
        confirmVariant="danger"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          setConfirmReset(false);
          store.reset();
          toast('Collection remise à zéro.', 'success');
        }}
      >
        Toutes tes puffs et tes statistiques seront perdues. Pense à exporter ta sauvegarde avant.
      </ConfirmDialog>
    </div>
  );
}

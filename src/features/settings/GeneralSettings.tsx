import type { ReactNode } from 'react';
import { updateSettings, type SettingsPatch } from '@/data';
import type { AppLocale, DateFormat, Theme } from '@/domain/model';
import { T, useT } from '@/i18n';
import { useFormat } from '@/i18n/format';
import { Field, InfoTip, Section, Select, Switch, TextInput, toast } from '@/ui';
import { reportError } from '../shared/actions';
import { useAppData } from '../shared/app-data';
import styles from './settings.module.css';

/** Language names are written in their own language (endonyms), never translated. */
const LANGUAGES: readonly { value: AppLocale; label: string; lang: string }[] = [
  { value: 'fr-FR', label: 'Français', lang: 'fr' },
  { value: 'en-GB', label: 'English', lang: 'en' },
];

const CURRENCIES = ['EUR', 'CHF', 'GBP', 'USD', 'CAD', 'MAD', 'XOF', 'JPY'];

export default function GeneralSettings(): ReactNode {
  const t = useT();
  const fmt = useFormat();
  const { settings } = useAppData();
  const save = (patch: SettingsPatch): void => {
    void updateSettings(patch)
      .then(() => toast(t('settings.saved'), { tone: 'success', duration: 3000 }))
      .catch((e: unknown) => reportError(e, t));
  };
  return (
    <div className={styles.stack}>
      <Section title={<T id="settings.display" />} panel headingLevel={2}>
        <div className={styles.grid2}>
          <Field label={<T id="settings.language" />}>
            <Select
              value={settings.locale}
              onChange={(e) => save({ locale: e.target.value as AppLocale })}
            >
              {LANGUAGES.map((l) => (
                <option key={l.value} value={l.value} lang={l.lang}>
                  {l.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={<T id="settings.theme" />}>
            <Select
              value={settings.theme}
              onChange={(e) => save({ theme: e.target.value as Theme })}
            >
              <option value="system">{t('settings.theme.system')}</option>
              <option value="light">{t('settings.theme.light')}</option>
              <option value="dark">{t('settings.theme.dark')}</option>
            </Select>
          </Field>
          <Field label={<T id="settings.currency" />} hint={<T id="settings.currencyHint" />}>
            <Select value={settings.currency} onChange={(e) => save({ currency: e.target.value })}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={<T id="settings.dateFormat" />}>
            <Select
              value={settings.dateFormat}
              onChange={(e) => save({ dateFormat: e.target.value as DateFormat })}
            >
              <option value="locale">
                {t('settings.dateFormat.locale', {
                  example: new Intl.DateTimeFormat(settings.locale).format(new Date(2026, 9, 23)),
                })}
              </option>
              <option value="dd/MM/yyyy">23/10/2026</option>
              <option value="yyyy-MM-dd">2026-10-23</option>
            </Select>
          </Field>
        </div>
      </Section>
      <Section title={<T id="settings.budgetSection" />} panel>
        <Field
          label={
            <>
              <T id="settings.startDay" />{' '}
              <InfoTip label={t('settings.startDayHelpLabel')}>
                <T id="settings.startDayHelp" />
              </InfoTip>
            </>
          }
          hint={<T id="settings.startDayHint" values={{ example: fmt.period('2025-11') }} />}
        >
          <Select
            value={settings.budgetMonthStartDay}
            onChange={(e) => save({ budgetMonthStartDay: Number(e.target.value) })}
          >
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {d === 1 ? t('settings.startDay.first') : t('settings.startDay.nth', { day: d })}
              </option>
            ))}
          </Select>
        </Field>
        <Switch
          label={<T id="settings.autoRenew" />}
          description={<T id="settings.autoRenewHint" />}
          checked={settings.budgetAutoRenew}
          onChange={(budgetAutoRenew) => save({ budgetAutoRenew })}
        />
      </Section>
      <Section title={<T id="settings.backupSection" />} panel>
        <Field
          label={<T id="settings.backupReminder" />}
          hint={<T id="settings.backupReminderHint" />}
        >
          <TextInput
            type="number"
            min={0}
            max={365}
            inputMode="numeric"
            defaultValue={settings.backupReminderDays}
            onBlur={(e) => {
              const n = Math.max(0, Math.min(365, Math.round(Number(e.target.value) || 0)));
              if (n !== settings.backupReminderDays) save({ backupReminderDays: n });
            }}
          />
        </Field>
      </Section>
    </div>
  );
}

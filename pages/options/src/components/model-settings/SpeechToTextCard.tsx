import { t } from '@extension/i18n';
import { SelectChevron } from './SelectChevron';
import { FIELD_LABEL, SELECT_WELL } from './styles';
import type { AvailableModel } from './types';

interface SpeechToTextCardProps {
  /** already narrowed to the providers that can transcribe */
  models: AvailableModel[];
  value: string;
  onChange: (modelValue: string) => void;
}

/** The model used to turn the side panel's microphone recordings into text. */
export const SpeechToTextCard = ({ models, value, onChange }: SpeechToTextCardProps) => (
  <div className="rounded-slab bg-canvas-raised p-5 shadow-neu">
    <label htmlFor="speech-to-text-model" className={FIELD_LABEL}>
      {t('options_models_labels_model')}
    </label>
    <div className="relative">
      <select id="speech-to-text-model" className={SELECT_WELL} value={value} onChange={e => onChange(e.target.value)}>
        <option value="">{t('options_models_chooseModel')}</option>
        {models.map(({ provider, providerName, model }) => (
          <option key={`${provider}>${model}`} value={`${provider}>${model}`}>
            {`${providerName} > ${model}`}
          </option>
        ))}
      </select>
      <SelectChevron />
    </div>
  </div>
);
